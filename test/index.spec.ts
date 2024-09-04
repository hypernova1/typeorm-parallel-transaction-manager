import ParallelTransactionManager from "../src";
import { DataSource } from "typeorm";
import TestEntity from './entity/test-entity';
import ProxyQueryRunner from '../src/proxy-query-runner';


describe('test', () => {
    let parallelTransactionManager: ParallelTransactionManager;

    const dataSource = new DataSource({
        type: "mysql",
        database: 'test',
        host: 'localhost',
        username: 'root',
        password: '1111',
        synchronize: true,
        logging: false,
        entities: [TestEntity],
    });
    parallelTransactionManager = new ParallelTransactionManager(dataSource);
    beforeAll(async () => {
        await dataSource.initialize();
    })

    beforeEach(async () => {
        const queryRunner = dataSource.createQueryRunner();
        try {
            await queryRunner.connect();
            await queryRunner.query('DELETE FROM test_entity WHERE id > 0');
        } catch (e) {
            console.error(e);
        } finally {
            await queryRunner.release();
        }
    });

    afterAll(async () => {
        await dataSource.destroy();
    })

    it('test parallel transaction', async () => {
        const queryRunners: ProxyQueryRunner[] = [];
        for (let i = 0; i < 5; i++) {
            const queryRunner = dataSource.createQueryRunner();
            queryRunners.push(new ProxyQueryRunner(queryRunner));
        }

        await Promise.allSettled(queryRunners.map(async (queryRunner: ProxyQueryRunner) => {
            await queryRunner.connect();
            await queryRunner.startTransaction();
            await queryRunner.queryRunner.manager.query('INSERT INTO test_entity(name) VALUES ("hello")');
            await queryRunner.commitTransaction();
            await queryRunner.release();
        }));
    });

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