import AWS = require('aws-sdk');

import { Type, TypeShape } from '@punchcard/shape';
import { DDB, IndexClient } from '@punchcard/shape-dynamodb';
import { CDK } from '../core/cdk';
import { Dependency } from '../core/dependency';
import { Run } from '../core/run';
import { Table } from './table';
import { keyType } from './util';

import type * as dynamodb from '@aws-cdk/aws-dynamodb';
import type * as iam from '@aws-cdk/aws-iam';
import { DataSourceProps } from '../appsync';
import { VTL } from '../appsync/lang/vtl';
import { query, QueryRequest, QueryResponse } from './query-request';

export interface IndexProps<SourceTable extends Table<any, any>, Projection extends TypeShape, Key extends DDB.KeyOf<Projection>> {
  /**
   * Table this index is for.
   */
  sourceTable: SourceTable;
  /**
   * Name of the Index.
   */
  indexName: string;
  /**
   * Type of data projected from the SourceTable
   */
  projection: Projection;
  /**
   * The key by which the Index will be queried.
   */
  key: Key;
  /**
   * Typeof index: `global` or `local`.
   */
  indexType: 'global' | 'local';
}

/**
 * Represents an Index of a DynamoDB Table
 */
export class Index<SourceTable extends Table<TypeShape, any>, Projection extends TypeShape, Key extends DDB.KeyOf<Projection>> {
  /**
   * Source Table of this Index.
   */
  public readonly sourceTable: SourceTable;

  /**
   * Shape of data in the table.
   */
  public readonly projection: Projection;

  /**
   * The table's key (hash key, or hash+sort key pair).
   */
  public readonly key: Key;

  /**
   * Name of the Index.
   */
  public readonly indexName: string;

  /**
   * Type of index (`global` or `local`).
   */
  public readonly indexType: 'global' | 'local';

  private _keyShape: TypeShape; // cache
  private get keyShape() {
    if (!this._keyShape) {
      const keyMembers: any = {
        [this.key.partition]: this.projection.Members[this.key.partition as any]
      };
      if (this.key.sort) {
        keyMembers[this.key.sort] = this.projection.Members[this.key.sort as any];
      }
      this._keyShape = Type(keyMembers);
    }
    return this._keyShape;
  }

  constructor(props: IndexProps<SourceTable, Projection, Key>) {
    this.indexName = props.indexName;
    this.indexType = props.indexType;
    this.sourceTable = props.sourceTable;
    this.key = props.key;
    this.projection = props.projection || props.sourceTable.dataType;

    const type = this.projection;

    CDK.chain(({dynamodb}) => this.sourceTable.resource.map(table => {
      const partitionKey = {
        name: this.key.partition,
        type: keyType(type.Members[this.key.partition as any])
      };
      const sortKey = this.key.sort ? {
        name: this.key.sort,
        type: keyType(type.Members[this.key.sort as any])
      } : undefined;

      // the names of both the table and the index's partition+sort keys.
      // projections are required to at least have these properties
      const KEY_MEMBERS = new Set([
        this.key.partition,
        this.key.sort
      ].filter(_ => _ !== undefined));

      // const projection = ShapeGuards.isShape(props.projection) ? props.projection : props.projection();
      // name of the properties in the projection
      const PROJECTION_MEMBERS = new Set(Object.keys(this.projection.Members));
      for (const KEY of KEY_MEMBERS.values()) {
        if (!PROJECTION_MEMBERS.has(KEY as string)) {
          throw new Error(`invalid projection, missing key: ${KEY}`);
        }
      }

      // all properties in the Table
      const TABLE_MEMBERS = new Set(Object.keys(props.sourceTable.dataType.Members));

      const projectionType =
        PROJECTION_MEMBERS.size === TABLE_MEMBERS.size ? dynamodb.ProjectionType.ALL :
        PROJECTION_MEMBERS.size === KEY_MEMBERS.size ? dynamodb.ProjectionType.KEYS_ONLY :
        dynamodb.ProjectionType.INCLUDE
        ;

      const definition: any = {
        indexName: this.indexName,
        partitionKey,
        sortKey,
        projectionType,
      };
      if (projectionType === dynamodb.ProjectionType.INCLUDE) {
        definition.nonKeyAttributes = Array.from(PROJECTION_MEMBERS.values()).filter(p => !KEY_MEMBERS.has(p));
      }
      if (this.indexType === 'global') {
        table.addGlobalSecondaryIndex(definition);
      } else {
        if (definition.sortKey === undefined) {
          throw new Error(`sortKey cannot be undefined when creating a Local Secondary Index`);
        }
        delete definition.partitionKey;
        table.addLocalSecondaryIndex(definition);
      }
    }));
  }

  public *query<Q extends QueryRequest<Projection, Key>>(request: Q, props?: DataSourceProps): VTL<QueryResponse<Q, Projection, Key>> {
    return yield* query({
      dataType: this.projection,
      key: this.key,
      keyShape: this.keyShape,
      request,
      dataSourceProps: this.sourceTable.dataSourceProps((table, role) => table.grantReadData(role), props),
      indexName: this.indexName
    });
  }

  /**
   * Provides access to scan and query the Index.
   */
  public readAccess(): Dependency<IndexClient<Projection, Key>> {
    return this.dependency((table, target) => {
      table.grantReadData(target);
    });
  }

  // TODO: ??
  // public readonly queryAccess()
  // public readonly scanAccess()

  private dependency(grant: (table: dynamodb.Table, grantable: iam.IGrantable) => void): Dependency<IndexClient<Projection, Key>> {
    return {
      install: this.sourceTable.resource.map(table => (ns, grantable) => {
        ns.set('tableName', table.tableName);
        ns.set('indexName', this.indexName);
        grant(table, grantable);
      }),
      bootstrap: Run.of(async (ns, cache) => {
        return new IndexClient({
          data: this.projection,
          key: this.key as any,
          tableName: ns.get('tableName'),
          indexName: ns.get('indexName'),
          client: cache.getOrCreate('aws:dynamodb', () => new AWS.DynamoDB())
        });
      })
    };
  }
}

export namespace Index {
  /**
   * Constrains an Index to a valid Projection of a SourceTable.
   */
  export type Of<SourceTable extends Table<any, any>, Projection extends TypeShape, Key extends DDB.KeyOf<Projection>>
    = Index<
        SourceTable,
        Table.Data<SourceTable>['Members'] extends Projection['Members'] ? Projection : never,
        Key>;

  export interface GlobalProps<Projection extends TypeShape, Key extends DDB.KeyOf<Projection>> {
    /**
     * Name of the Secondary Index.
     */
    indexName: string;
    /**
     * Key by which the Index will be queried.
     */
    key: Key;
    /**
     * Read capacity of the Index.
     */
    readCapacity?: number;
    /**
     * Write capacity of the Index.
     */
    writerCapacity?: number;
  }

  export interface LocalProps<Projection extends TypeShape, Key extends keyof Projection['Members']> {
    /**
     * Name of the Secondary Index.
     */
    indexName: string;
    /**
     * Key by which the Index will be queried.
     */
    key: Key;
    /**
     * Read capacity of the Index.
     */
    readCapacity?: number;
    /**
     * Write capacity of the Index.
     */
    writerCapacity?: number;
  }
}