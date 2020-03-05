import * as CloudWatch from '../cloudwatch';

import { Build } from '../core/build';
import { CDK } from '../core/cdk';
import { Client } from '../core/client';
import { Dependency } from '../core/dependency';
import { Duration } from '../core/duration';
import { Function, FunctionProps } from './function';

import type * as cdk from '@aws-cdk/core';

export interface ScheduleProps<D extends Dependency<any>> extends FunctionProps<typeof CloudWatch.Event.Payload, any, D> {
  schedule: Schedule;
}

/**
 * Create a new Lambda Function and trigger it to run on some schedule.
 *
 * @param scope construct scope to create Function under
 * @param id id of the Function construct.
 * @param props function and schedule props.
 */
export function schedule<D extends Dependency<any>>(scope: Build<cdk.Construct>, id: string, props: ScheduleProps<D>, handler: (event: CloudWatch.Event.Payload, clients: Client<D>, context: any) => Promise<any>) {
  const f = new Function<typeof CloudWatch.Event.Payload, any, D>(scope, id, props, handler);

  f.resource.map(f => new CDK.Events.Rule(f, 'Schedule', {
      schedule: props.schedule,
      targets: [new CDK.EventsTargets.LambdaFunction(f)]
    }));

  return f;
}

/**
 * Copied from @aws-cdk/aws-events to avoid depending on the entire CDK framework at runtime.
 */

/**
 * Schedule for scheduled event rules
 */
export abstract class Schedule {
  /**
   * Construct a schedule from a literal schedule expression
   *
   * @param expression The expression to use. Must be in a format that Cloudwatch Events will recognize
   */
  public static expression(expression: string): Schedule {
    return new LiteralSchedule(expression);
  }

  /**
   * Construct a schedule from an interval and a time unit
   */
  public static rate(duration: Duration): Schedule {
    if (duration.toSeconds() === 0) {
      throw new Error('Duration cannot be 0');
    }

    let rate = maybeRate(duration.toDays({ integral: false }), 'day');
    if (rate === undefined) { rate = maybeRate(duration.toHours({ integral: false }), 'hour'); }
    if (rate === undefined) { rate = makeRate(duration.toMinutes({ integral: true }), 'minute'); }
    return new LiteralSchedule(rate);
  }

  /**
   * Create a schedule from a set of cron fields
   */
  public static cron(options: CronOptions): Schedule {
    if (options.weekDay !== undefined && options.day !== undefined) {
      throw new Error(`Cannot supply both 'day' and 'weekDay', use at most one`);
    }

    const minute = fallback(options.minute, '*');
    const hour = fallback(options.hour, '*');
    const month = fallback(options.month, '*');
    const year = fallback(options.year, '*');

    // Weekday defaults to '?' if not supplied. If it is supplied, day must become '?'
    const day = fallback(options.day, options.weekDay !== undefined ? '?' : '*');
    const weekDay = fallback(options.weekDay, '?');

    return new LiteralSchedule(`cron(${minute} ${hour} ${day} ${month} ${weekDay} ${year})`);
  }

  /**
   * Retrieve the expression for this schedule
   */
  public abstract readonly expressionString: string;

  protected constructor() {
  }
}

/**
 * Options to configure a cron expression
 *
 * All fields are strings so you can use complex expresions. Absence of
 * a field implies '*' or '?', whichever one is appropriate.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html#CronExpressions
 */
export interface CronOptions {
  /**
   * The minute to run this rule at
   *
   * @default - Every minute
   */
  readonly minute?: string;

  /**
   * The hour to run this rule at
   *
   * @default - Every hour
   */
  readonly hour?: string;

  /**
   * The day of the month to run this rule at
   *
   * @default - Every day of the month
   */
  readonly day?: string;

  /**
   * The month to run this rule at
   *
   * @default - Every month
   */
  readonly month?: string;

  /**
   * The year to run this rule at
   *
   * @default - Every year
   */
  readonly year?: string;

  /**
   * The day of the week to run this rule at
   *
   * @default - Any day of the week
   */
  readonly weekDay?: string;
}

class LiteralSchedule extends Schedule {
  constructor(public readonly expressionString: string) {
    super();
  }
}

function fallback<T>(x: T | undefined, def: T): T {
  return x === undefined ? def : x;
}

/**
 * Return the rate if the rate is whole number
 */
function maybeRate(interval: number, singular: string) {
  if (interval === 0 || !Number.isInteger(interval)) { return undefined; }
  return makeRate(interval, singular);
}

/**
 * Return 'rate(${interval} ${singular}(s))` for the interval
 */
function makeRate(interval: number, singular: string) {
  return interval === 1 ? `rate(1 ${singular})` : `rate(${interval} ${singular}s)`;
}