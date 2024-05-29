# TypeORM Parallel Transaction Manager
This is a library that can obtain multiple connections and execute queries in parallel.

How to use

~~~typescript
// Initialize TypeORM DataSource
const dataSource = new DataSource({...});

// Initialize an instance of ParallelTransactionManager
const parallelTransactionManager = new ParallelTransactionManager(dataSource);

// Initialize an array of items to process (e.g., [1, 2, 3, 4])
const foos: Foo[] = [...];

// Run transactions in parallel and collect the results
const bars = await parallelTransactionManager.run(foos, async (foo: Foo, queryRunner: QueryRunner) => {
    // Perform tasks on each item (e.g., create a new Bar instance and save to the database)
    const bar = new Bar(foo);
    await queryRunner.manager.save(Bar, bar);
    return bar; // Return the result
});

// Output the results (or further process them)
console.log(bars);
~~~
