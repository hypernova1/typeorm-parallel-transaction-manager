import ParallelTransactionRunner from "../src";
import { DataSource } from "typeorm";
import TestEntity from './entity/test-entity';


describe('test', () => {
    let parallelTransactionRunner: ParallelTransactionRunner;
    beforeAll(async () => {
        const dataSource = new DataSource({
            type: "sqlite",
            database: ':memory:',
            synchronize: true,
            logging: false,
            entities: [TestEntity],
        });
        await dataSource.initialize();
        parallelTransactionRunner = new ParallelTransactionRunner(dataSource);
    })

    it('all insert', async () => {
        const size = 5;
        const results = await parallelTransactionRunner.run(new Array(size).fill(null), async (_, queryRunner) => {
            const testEntity = new TestEntity();
            testEntity.name = "test";
            return queryRunner.manager.save(TestEntity, testEntity);
        });
        expect(results.length).toEqual(size);
    })
});