import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export default class TestEntity {
    @PrimaryGeneratedColumn()
    id?: number;

    @Column()
    name?: string;
}