import { QueryRunner } from 'typeorm';
import {IsolationLevel} from "typeorm/driver/types/IsolationLevel";

/**
 * 쿼리러너 프록시 클래스
 * */
export default class ProxyQueryRunner {
    isFailure: boolean;
    queryRunner: QueryRunner;

    constructor(queryRunner: QueryRunner) {
        this.queryRunner = queryRunner;
        this.isFailure = false;
    }

    connect() {
        return this.queryRunner.connect();
    }

    release() {
        return this.queryRunner.release();
    }

    startTransaction(isolationLevel?: IsolationLevel) {
        return this.queryRunner.startTransaction(isolationLevel);
    }

    rollbackTransaction() {
        return this.queryRunner.rollbackTransaction();
    }

    commitTransaction() {
        return this.queryRunner.commitTransaction();
    }
}
