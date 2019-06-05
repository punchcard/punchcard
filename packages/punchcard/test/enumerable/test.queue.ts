import 'jest';
import sinon = require('sinon');

import cdk = require('@aws-cdk/cdk');
import { Dependency, integer, Queue, Stream, string } from '../../lib';
import { setRuntime } from '../../lib/constants';

setRuntime();

describe('run', () => {
  it('should parse event into records', async () => {
    const stack = new cdk.Stack(new cdk.App(), 'stack');

    const queue = new Queue(stack, 'Queue', {
      type: string()
    });

    const results: string[] = [];
    await (queue.stream().forEach(stack, 'od', {
      depends: Dependency.none,
      async handle(v) {
        results.push(v);
        return Promise.resolve(v);
      }
    }).handle({
      Records: [{
      body: JSON.stringify('string')
    } as any]}, [{}], {}));

    expect(results).toEqual(['string']);
  });
  it('should not require a depends property', async () => {
    const stack = new cdk.Stack(new cdk.App(), 'stack');

    const queue = new Queue(stack, 'Queue', {
      type: string()
    });

    const results: string[] = [];
    await (queue.stream().forEach(stack, 'od', {
      async handle(v) {
        results.push(v);
        return Promise.resolve(v);
      }
    }).handle({
      Records: [{
      body: JSON.stringify('string')
    } as any]}, [{}], {}));

    expect(results).toEqual(['string']);
  });
  it('should transform records with a map', async () => {
    const stack = new cdk.Stack(new cdk.App(), 'stack');

    const queue = new Queue(stack, 'Queue', {
      type: string()
    });

    const d1: Dependency<string> = {
      bootstrap: () => 'd1',
      install: () => undefined
    };
    const d2: Dependency<string> = {
      bootstrap: () => 'd2',
      install: () => undefined
    };

    const results: number[] = [];
    const f = await (queue.stream().map({
      depends: d1,
      handle: async (v, d1) => {
        expect(d1).toEqual('d1');
        return v.length;
      }
    }).forEach(stack, 'od', {
      depends: d2,
      handle: async (v, d2) => {
        expect(d2).toEqual('d2');
        results.push(v);
        return Promise.resolve(v);
      }
    }).boot());

    await f({
      Records: [{
      body: JSON.stringify('string')
    } as any]}, {});

    expect(results).toEqual(['string'.length]);
    expect.assertions(3);
  });
  it('should transform records with a map and `collect`', async () => {
    const stack = new cdk.Stack(new cdk.App(), 'stack');

    const queue = new Queue(stack, 'Queue', {
      type: string()
    });

    const d1: Dependency<string> = {
      bootstrap: () => 'd1',
      install: () => undefined
    };

    const [, l] = queue.stream()
      .map({
        depends: d1,
        handle: async (v, d1) => {
          expect(d1).toEqual('d1');
          return v.length;
        }
      })
      .collect(stack, 'ToSink', new Stream(stack, 'Stream', {
        type: integer(),
      }));

    const sink = {
      sink: sinon.fake()
    };

    await l.handle({
      Records: [{
      body: JSON.stringify('string')
    } as any]}, [sink as any, 'd1'], {});

    expect(sink.sink.calledOnceWith(['string'.length])).toBe(true);
    expect.assertions(2);
  });
  it('should transform records with a map and toStream', async () => {
    const stack = new cdk.Stack(new cdk.App(), 'stack');

    const queue = new Queue(stack, 'Queue', {
      type: string()
    });

    const d1: Dependency<string> = {
      bootstrap: () => 'd1',
      install: () => undefined
    };

    const [, l] = queue.stream()
      .map({
        depends: d1,
        handle: async (v, d1) => {
          expect(d1).toEqual('d1');
          return v.length;
        }
      })
      .toStream(stack, 'Stream', {
        type: integer()
      });

    const sink = {
      sink: sinon.fake()
    };

    await l.handle({
      Records: [{
      body: JSON.stringify('string')
    } as any]}, [sink as any, 'd1'], {});

    expect(sink.sink.calledOnceWith(['string'.length])).toBe(true);
    expect.assertions(2);
  });
});