import ParallelTransactionManager from "../src";
import { DataSource } from "typeorm";
import TestEntity from './entity/test-entity';


describe('test', () => {
    let parallelTransactionManager: ParallelTransactionManager;

    const dataSource = new DataSource({
        type: "sqlite",
        database: ':memory:',
        synchronize: true,
        logging: true,
        entities: [TestEntity],
    });
    parallelTransactionManager = new ParallelTransactionManager(dataSource);
    beforeAll(async () => {
        await dataSource.initialize();
    })

    afterEach(async () => {
        const queryRunner = dataSource.createQueryRunner();
        try {
            await queryRunner.connect();
            await queryRunner.query('DELETE FROM test_entity');
        } finally {
            await queryRunner.release();
        }
    })

    it('insert all', async () => {
        const size = 5;
        const results = await parallelTransactionManager.run(new Array(size).fill(null), async (_, queryRunner) => {
            const testEntity = new TestEntity();
            testEntity.name = "test";
            return queryRunner.manager.save(TestEntity, testEntity);
        });
        expect(results.length).toEqual(size);
    });

    it('error callback', async () => {
        const size = 5;
        let callbackCount = 0;
        let loop = 0;
        await expect(() => parallelTransactionManager.run(new Array(size).fill(null), async (_, queryRunner) => {
            loop++;
            const testEntity = new TestEntity();
            if (loop % 2 === 1) {
                throw new Error('error')
            }
            testEntity.name = "test";
            return queryRunner.manager.save(TestEntity, testEntity);
        }, {
            errorCallback: (_) => {
                callbackCount++;
            }
        })).rejects.toThrow();
        const savedEntities = await dataSource.manager.find(TestEntity)
        expect(savedEntities.length).toEqual(0);
    });
});