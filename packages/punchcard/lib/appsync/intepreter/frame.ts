import { expr, VObject } from "../types/object";

export class Frame {
  private readonly ids: Generator<string>;
  private readonly directives: (string | Frame)[] = [];
  private readonly tokens: (string | Frame)[] = [];
  private readonly children: Frame[];
  private readonly lexicalScope: WeakMap<any, string> = new WeakMap();

  constructor(private readonly parent?: Frame) {
    if (parent) {
      parent.children.push(this);
      this.ids = parent.ids;
      this.lexicalScope = parent.lexicalScope;
    } else {
      this.ids = infinite();
      this.lexicalScope = new WeakMap();
    }
    this.tokens.push();
  }

  public lookup(a: any): string | undefined {
    if (this.lexicalScope.has(a)) {
      return this.lexicalScope.get(a);
    } else if (this.parent) {
      return this.parent.lookup(a);
    }
    return undefined;
  }

  public register(a: any): string {
    this.lexicalScope.set(a, this.getNewId());
    return this.lookup(a)!;
  }

  private _indent: number = 0;
  public indent(): void {
    this._indent += 1;
  }

  public unindent(): void {
    this._indent -= 1;
    if (this._indent < 0) {
      throw new Error('indent underflow');
    }
  }

  public interpret(type: VObject): string | void {
    return type[expr].visit(this);
  }

  public render(): string {
    return (this.tokens).map(t => {
      if (typeof t === 'string') {
        return t;
      } else {
        return t.render();
      }
    }).join('');
  }

  public getNewId(): string {
    return this.ids.next().value;
  }

  public print(text?: string): void {
    if (text !== undefined) {
      this.tokens.push(text);
    }
  }
  public printLine(text?: string): void {
    this.print(text);
    this.print('\n');

    // auto indent
    for (let i = 0; i < this._indent; i++) {
      this.print('  ');
    }
  }

  public block(f: (frame: Frame) => void): void {
    f(new Frame(this));
  }
}

function* infinite() {
  let i = 1;
  while (true) {
    yield 'var' + i.toString(10);
    i += 1;
    if (i === Number.MAX_SAFE_INTEGER) {
      throw new Error(`reached maximum value of safe integers. how did you manage to do that?!`);
    }
  }
}