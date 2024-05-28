import { QueryRunner } from 'typeorm';

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

    startTransaction() {
        return this.queryRunner.startTransaction();
    }

    rollbackTransaction() {
        return this.queryRunner.rollbackTransaction();
    }

    commitTransaction() {
        return this.queryRunner.commitTransaction();
    }
}
