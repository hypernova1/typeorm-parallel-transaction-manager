import ParallelTransactionManager from "../src";
import { DataSource } from "typeorm";
import TestEntity from './entity/test-entity';


describe('test', () => {
    let parallelTransactionManager: ParallelTransactionManager;
    beforeAll(async () => {
        const dataSource = new DataSource({
            type: "sqlite",
            database: ':memory:',
            synchronize: true,
            logging: false,
            entities: [TestEntity],
        });
        await dataSource.initialize();
        parallelTransactionManager = new ParallelTransactionManager(dataSource);
    })

    it('all insert', async () => {
        const size = 5;
        const results = await parallelTransactionManager.run(new Array(size).fill(null), async (_, queryRunner) => {
            const testEntity = new TestEntity();
            testEntity.name = "test";
            return queryRunner.manager.save(TestEntity, testEntity);
        });
        expect(results.length).toEqual(size);
    })
});