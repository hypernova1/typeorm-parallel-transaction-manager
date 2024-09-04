import { DataSource, QueryRunner } from 'typeorm';
import ProxyQueryRunner from "./proxy-query-runner";
import { IsolationLevel } from "typeorm/driver/types/IsolationLevel";

export default class ParallelTransactionManager {
    readonly dataSource: DataSource;

    constructor(dataSource: DataSource) {
        this.dataSource = dataSource;
    }

    /**
     * 병렬 트랜잭션을 시작한다.
     *
     * @param values 함수의 각 사이클마다 인자로 받을 데이터의 배열
     * @param func 실행할 함수
     * @param options 옵션
     * @return 처리 결과
     * */
    async run<T, R>(
        values: T[],
        func: (t: T, queryRunner: QueryRunner) => Promise<R>,
        options?: {
            maxConnection?: number;
            isolationLevel?: IsolationLevel;
            errorCallback?: (e: any) => void;
        }
    ): Promise<R extends void ? void : R[]> {
        let valuesList: T[][] = [values]
        if (options?.maxConnection && options.maxConnection < values.length) {
            valuesList = this.sliceArray(values, options.maxConnection);
        }

        let results: PromiseSettledResult<any>[] = [];
        let successQueryRunners: ProxyQueryRunner[] = [];
        for (const vs of valuesList) {
            const { resultPromiseAllSettles, queryRunners } = await this.execute(vs, func, {
                isolationLevel: options?.isolationLevel,
            });

            const rejects = resultPromiseAllSettles.filter((result) => result.status === 'rejected');
            if (rejects.length) {
                const errors: Error[] = rejects.map((reject) => (reject as PromiseRejectedResult).reason);
                const failureQueryRunners = this.filterFailureQueryRunner(queryRunners);
                await this.rollbackAll(failureQueryRunners);
                throw errors[0];
            }

            results = results.concat(resultPromiseAllSettles);
            successQueryRunners = successQueryRunners.concat(queryRunners);
        }

        await this.commitAll(successQueryRunners);

        return results.filter((result) => result.status === 'fulfilled').map((result: any) => result.value as R) as R extends void
            ? void
            : R[];
    }

    /**
     * 쿼리를 실행한후 쿼리 러너와 결과를 모두 반환한다.
     *
     * @param values 함수의 각 사이클마다 인자로 받을 데이터의 배열
     * @param func 실행할 함수
     * @param options 옵션
     * @return 쿼리 러너 및 처리 결과
     * */
    private async execute<T, R>(values: T[], func: (t: T, queryRunner: QueryRunner) => (Promise<R> | R), options?: {
        maxConnection?: number;
        rollbackAllIfAnyFailed?: boolean;
        isolationLevel?: IsolationLevel;
        errorCallback?: ((e: any) => void)
    }) {
        const queryRunners: ProxyQueryRunner[] = [];

        const resultPromiseAllSettles = await this.executeQueries(values, queryRunners, func, options);

        return {
            queryRunners,
            resultPromiseAllSettles
        }
    }

    /**
     * 쿼리를 실행한 후 결과를 받아온다.
     *
     * @param values 함수의 각 사이클마다 인자로 받을 데이터의 배열
     * @param queryRunners 커넥션 목록
     * @param func 실행할 함수
     * @param options 옵션
     * @return 처리 결과
     * */
    private async executeQueries<T, R>(values: T[], queryRunners: ProxyQueryRunner[], func: (t: T, queryRunner: QueryRunner) => (Promise<R> | R), options?: {
        maxConnection?: number;
        rollbackAllIfAnyFailed?: boolean;
        isolationLevel?: IsolationLevel;
        errorCallback?: (e: any) => void
    }) {
        return Promise.allSettled(values.map(async (value: T) => {
            const queryRunner = new ProxyQueryRunner(this.dataSource.createQueryRunner());
            queryRunners.push(queryRunner);
            await queryRunner.connect();
            await queryRunner.startTransaction(options?.isolationLevel);

            try {
                return await func(value, queryRunner.queryRunner);
            } catch (e) {
                queryRunner.isFailure = true;
                if (options?.errorCallback) {
                    options.errorCallback(e);
                } else {
                    return Promise.reject(e);
                }
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
