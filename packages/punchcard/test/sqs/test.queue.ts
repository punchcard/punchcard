import 'jest';
import sinon = require('sinon');

import core = require('@aws-cdk/core');
import { Core, Shape, SQS, Util } from '../../lib';
import { Build } from '../../lib/core/build';
import { Run } from '../../lib/core/run';

Util.setRuntime();

describe('run', () => {
  it('should parse event into records', async () => {
    const stack = Build.of(new core.Stack(new core.App( { autoSynth: false } ), 'stack'));

    const queue = new SQS.Queue(stack, 'Queue', {
      shape: Shape.string()
    });

    const results: string[] = [];
    await (queue.messages().forEach(stack, 'od', {
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
    const stack = Build.of(new core.Stack(new core.App( { autoSynth: false } ), 'stack'));

    const queue = new SQS.Queue(stack, 'Queue', {
      shape: Shape.string()
    });

    const results: string[] = [];
    await (queue.messages().forEach(stack, 'od', {
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
    const stack = Build.of(new core.Stack(new core.App( { autoSynth: false } ), 'stack'));

    const queue = new SQS.Queue(stack, 'Queue', {
      shape: Shape.string()
    });

    const d1: Core.Dependency<string> = {
      bootstrap: Run.of(async () => 'd1'),
      install: Build.of(() => undefined)
    };
    const d2: Core.Dependency<string> = {
      bootstrap: Run.of(async () => 'd2'),
      install: Build.of(() => undefined)
    };

    const results: number[] = [];
    const f = await (Run.resolve(queue.messages().map({
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
    }).entrypoint));

    await f({
      Records: [{
      body: JSON.stringify('string')
    } as any]}, {});

    expect(results).toEqual(['string'.length]);
    expect.assertions(3);
  });
  it('should transform records with a map and `collect`', async () => {
    const stack = Build.of(new core.Stack(new core.App( { autoSynth: false } ), 'stack'));

    const queue = new SQS.Queue(stack, 'Queue', {
      shape: Shape.string()
    });

    const d1: Core.Dependency<string> = {
      bootstrap: Run.of(async () => 'd1'),
      install: Build.of(() => undefined)
    };

    const stream = queue.messages()
      .map({
        depends: d1,
        handle: async (v, d1) => {
          expect(d1).toEqual('d1');
          return v.length;
        }
      })
      .collect(stack, 'Stream', Util.Collectors.toKinesisStream({
        shape: Shape.integer()
      }));

    const sink = {
      sink: sinon.fake()
    };

    await stream.sender.handle({
      Records: [{
      body: JSON.stringify('string')
    } as any]}, [sink as any, 'd1'], {});

    expect(sink.sink.calledOnceWith(['string'.length])).toBe(true);
    expect.assertions(2);
  });
  it('should transform records with a map and toStream', async () => {
    const stack = Build.of(new core.Stack(new core.App( { autoSynth: false } ), 'stack'));

    const queue = new SQS.Queue(stack, 'Queue', {
      shape: Shape.string()
    });

    const d1: Core.Dependency<string> = {
      bootstrap: Run.of(async () => 'd1'),
      install: Build.of(() => undefined)
    };

    const stream = queue.messages()
      .map({
        depends: d1,
        handle: async (v, d1) => {
          expect(d1).toEqual('d1');
          return v.length;
        }
      })
      .toKinesisStream(stack, 'Stream', {
        shape: Shape.integer()
      });

    const sink = {
      sink: sinon.fake()
    };

    await stream.sender.handle({
      Records: [{
      body: JSON.stringify('string')
    } as any]}, [sink as any, 'd1'], {});

    expect(sink.sink.calledOnceWith(['string'.length])).toBe(true);
    expect.assertions(2);
  });
});