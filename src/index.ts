import { DataSource, QueryRunner } from 'typeorm';
import ProxyQueryRunner from "./proxy-query-runner";

export default class ParallelTransactionRunner {
    readonly dataSource: DataSource;

    constructor(dataSource: DataSource) {
        this.dataSource = dataSource;
    }

    /**
     * 병렬 트랜잭션을 시작한다.
     *
     * @param values
     * @param func
     * @param options
     * @return 처리 결과
     * */
    async run<T, R>(
        values: T[],
        func: (t: T, queryRunner: QueryRunner) => R | Promise<R>,
        options?: {
            maxConnection?: number;
            rollbackAllIfAnyFailed?: boolean;
        }
    ): Promise<R extends void ? void : R[]> {
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

        const queryRunners: ProxyQueryRunner[] = [];

        const results = await this.executeQueries(values, queryRunners, func);

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

    /**
     * 쿼리를 실행한 후 결과를 받아온다.
     *
     * @param values
     * @param queryRunners
     * @param func
     * */
    private async executeQueries<T, R>(values: T[], queryRunners: ProxyQueryRunner[], func: (t: T, queryRunner: QueryRunner) => (Promise<R> | R)) {
        return Promise.allSettled(values.map(async (value: T) => {
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
        }));
    }

    /**
     * 실패한 커넥션을 필터링한다.
     *
     * @param queryRunners
     * @return 실패한 커넥션
     * */
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

    /**
     * 트랜잭션 목록을 롤백 후 커넥션을 반납한다.
     *
     * @param failureQueryRunners 실패한 커넥션 목록
     * */
    private async rollbackAll(failureQueryRunners: ProxyQueryRunner[]) {
        for (const failureQueryRunner of failureQueryRunners) {
            await failureQueryRunner.rollbackTransaction();
            await failureQueryRunner.release();
        }
    }

    /**
     * 트랜잭션 목록을 커밋한 후 커넥션을 반납한다.
     *
     * @param queryRunners 커밋할 커넥션 목록
     * */
    private async commitAll(queryRunners: ProxyQueryRunner[]) {
        for (const queryRunner of queryRunners) {
            await queryRunner.commitTransaction();
            await queryRunner.release();
        }
    }

    /**
     * 배열을 사이즈만큼 다시 잘라낸 후 반환한다.
     *
     * @param array 잘라낼 배열
     * @param size 잘라낼 사이즈
     * @return 잘라낸 배열 목록
     * */
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
