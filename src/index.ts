import { DataSource, QueryRunner } from 'typeorm';
import ProxyQueryRunner from "./proxy-query-runner";

export default class ParallelTransactionRunner {
    readonly dataSource: DataSource;

    constructor(dataSource: DataSource) {
        this.dataSource = dataSource;
    }

    async run<T, R>(
        values: T[],
        func: (t: T, queryRunner: QueryRunner) => R | Promise<R>,
        options?: {
            maxConnection?: number;
            rollbackAllIfAnyFailed?: boolean;
        }
    ): Promise<R extends void ? void : R[]> {
        const queryRunners: ProxyQueryRunner[] = [];

        if (options?.maxConnection && options.maxConnection < values.length) {
            const valuesList = this.sliceArray(values, options.maxConnection);
            let rs: any = [];
            for (const vs of valuesList) {
                const r = await this.run(vs, func, {
                    rollbackAllIfAnyFailed: options?.rollbackAllIfAnyFailed,
                });
                rs = rs.concat(r);
            }
            return rs;
        }

        const results = await Promise.allSettled(
            values.map(async (value) => {
                const queryRunner = new ProxyQueryRunner(this.dataSource.createQueryRunner());
                queryRunners.push(queryRunner);
                await queryRunner.connect();
                await queryRunner.startTransaction();

                try {
                    const returnValue = await func(value, queryRunner.queryRunner);
                    return returnValue as R;
                } catch (e) {
                    queryRunner.isFailure = true;
                    return Promise.reject(e);
                }
            })
        );

        const rejects = results.filter((result) => result.status === 'rejected');

        if (rejects.length) {
            const errors: Error[] = rejects.map((reject) => (reject as PromiseRejectedResult).reason);
            console.error(errors);
            if (!options?.rollbackAllIfAnyFailed) {
                await this.rollbackAll(queryRunners);
                throw errors;
            }

            const failureQueryRunners = this.filterFailureQueryRunner(queryRunners);
            await this.rollbackAll(failureQueryRunners);
        }

        await this.commitAll(queryRunners);

        return results.filter((result) => result.status === 'fulfilled').map((result: any) => result.value as R) as R extends void
            ? void
            : R[];
    }

    private filterFailureQueryRunner(queryRunners: ProxyQueryRunner[]) {
        const failureQueryRunners: ProxyQueryRunner[] = [];
        for (let i = queryRunners.length - 1; i >= 0; i--) {
            if (queryRunners[i].isFailure) {
                failureQueryRunners.push(queryRunners[i]);
                queryRunners.splice(i, 1);
            }
        }
        return failureQueryRunners;
    }

    private async rollbackAll(failureQueryRunners: ProxyQueryRunner[]) {
        for (const failureQueryRunner of failureQueryRunners) {
            await failureQueryRunner.rollbackTransaction();
            await failureQueryRunner.release();
        }
    }

    private async commitAll(queryRunners: ProxyQueryRunner[]) {
        for (const queryRunner of queryRunners) {
            await queryRunner.commitTransaction();
            await queryRunner.release();
        }
    }

    private sliceArray<T>(array: T[], size: number): T[][] {
        const slicedArray = [];
        let index = 0;

        while (index < array.length) {
            slicedArray.push(array.slice(index, index + size));
            index += size;
        }

        return slicedArray;
    }
}
