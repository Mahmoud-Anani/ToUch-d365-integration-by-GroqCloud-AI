import { ValidationError } from '../errors';
import type { EntityProperty } from '../metadata/types';
import { propertyKind } from '../metadata/types';

const COMPARISON_OPERATORS = new Set(['eq', 'ne', 'gt', 'ge', 'lt', 'le']);
const FUNCTIONS = new Set(['startswith', 'endswith', 'contains']);
const MAX_FILTER_LENGTH = 2_000;
const MAX_TOKENS = 300;
const MAX_STRING_VALUE = 500;

type TokenKind =
  | 'identifier'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'operator'
  | 'lparen'
  | 'rparen'
  | 'comma';

interface Token {
  kind: TokenKind;
  value: string | number | boolean | null;
  position: number;
}

export interface FilterFieldResolver {
  (fieldName: string): EntityProperty;
}

function fail(message: string, position?: number): never {
  throw new ValidationError(
    position === undefined ? `Invalid filter: ${message}` : `Invalid filter at position ${position}: ${message}`,
  );
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index] as string;

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '(') {
      tokens.push({ kind: 'lparen', value: '(', position: index });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ kind: 'rparen', value: ')', position: index });
      index += 1;
      continue;
    }
    if (char === ',') {
      tokens.push({ kind: 'comma', value: ',', position: index });
      index += 1;
      continue;
    }

    if (char === "'") {
      const start = index;
      index += 1;
      let value = '';
      let closed = false;
      while (index < input.length) {
        const current = input[index] as string;
        if (current === "'") {
          if (input[index + 1] === "'") {
            value += "'";
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        value += current;
        index += 1;
      }
      if (!closed) fail('unterminated string literal', start);
      if (value.length > MAX_STRING_VALUE) fail('string literal is too long', start);
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
        fail('string literal contains control characters', start);
      }
      tokens.push({ kind: 'string', value, position: start });
      continue;
    }

    if (char === '-' || /[0-9]/.test(char)) {
      const rest = input.slice(index);
      const match = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
      if (!match) fail(`unexpected character "${char}"`, index);
      const raw = match[0];
      const value = Number(raw);
      if (!Number.isFinite(value)) fail('numeric literal is not finite', index);
      tokens.push({ kind: 'number', value, position: index });
      index += raw.length;
      continue;
    }

    const identifierMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(index));
    if (identifierMatch) {
      const raw = identifierMatch[0];
      const lowered = raw.toLowerCase();
      if (COMPARISON_OPERATORS.has(lowered)) {
        tokens.push({ kind: 'operator', value: lowered, position: index });
      } else if (lowered === 'and' || lowered === 'or' || lowered === 'not') {
        tokens.push({ kind: 'operator', value: lowered, position: index });
      } else if (lowered === 'true' || lowered === 'false') {
        tokens.push({ kind: 'boolean', value: lowered === 'true', position: index });
      } else if (lowered === 'null') {
        tokens.push({ kind: 'null', value: null, position: index });
      } else {
        tokens.push({ kind: 'identifier', value: raw, position: index });
      }
      index += raw.length;
      continue;
    }

    fail(`unexpected character "${char}"`, index);
  }

  if (tokens.length > MAX_TOKENS) fail('expression is too complex');
  return tokens;
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly resolveField: FilterFieldResolver,
  ) {}

  parse(): string {
    if (this.tokens.length === 0) fail('expression is empty');
    const expression = this.parseOr();
    if (this.peek()) fail('unexpected trailing tokens', this.peek()?.position);
    return expression;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private consume(): Token {
    const token = this.tokens[this.index];
    if (!token) fail('unexpected end of expression');
    this.index += 1;
    return token;
  }

  private expect(kind: TokenKind, value?: string): Token {
    const token = this.peek();
    if (!token || token.kind !== kind || (value !== undefined && token.value !== value)) {
      fail(`expected ${value ?? kind}`, token?.position);
    }
    return this.consume();
  }

  private parseOr(): string {
    let left = this.parseAnd();
    while (this.peek()?.kind === 'operator' && this.peek()?.value === 'or') {
      this.consume();
      const right = this.parseAnd();
      left = `(${left} or ${right})`;
    }
    return left;
  }

  private parseAnd(): string {
    let left = this.parseNot();
    while (this.peek()?.kind === 'operator' && this.peek()?.value === 'and') {
      this.consume();
      const right = this.parseNot();
      left = `(${left} and ${right})`;
    }
    return left;
  }

  private parseNot(): string {
    if (this.peek()?.kind === 'operator' && this.peek()?.value === 'not') {
      this.consume();
      const operand = this.parseNot();
      return operand.startsWith('(') && operand.endsWith(')') ? `not ${operand}` : `not (${operand})`;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): string {
    const token = this.peek();
    if (!token) fail('unexpected end of expression');

    if (token.kind === 'lparen') {
      this.consume();
      const expression = this.parseOr();
      this.expect('rparen');
      return `(${expression})`;
    }

    if (token.kind === 'identifier') {
      const next = this.tokens[this.index + 1];
      if (next?.kind === 'lparen') {
        return this.parseFunction();
      }
      return this.parseComparison();
    }

    fail('expected a field name, function, or parenthesised expression', token.position);
  }

  private parseFunction(): string {
    const nameToken = this.consume();
    const functionName = String(nameToken.value).toLowerCase();
    if (!FUNCTIONS.has(functionName)) fail(`unsupported function "${nameToken.value}"`, nameToken.position);
    this.expect('lparen');

    const fieldToken = this.consume();
    if (fieldToken.kind !== 'identifier') fail('function requires a field name', fieldToken.position);
    const property = this.resolveField(String(fieldToken.value));
    const kind = propertyKind(property.type);
    if (kind !== 'string' && kind !== 'guid') {
      fail(`function ${functionName} requires a string field`, fieldToken.position);
    }

    this.expect('comma');
    const valueToken = this.consume();
    if (valueToken.kind !== 'string') fail('function requires a quoted string value', valueToken.position);
    const value = String(valueToken.value);
    this.expect('rparen');

    return `${functionName}(${property.name},${escapeString(value)})`;
  }

  private parseComparison(): string {
    const fieldToken = this.consume();
    const property = this.resolveField(String(fieldToken.value));
    const operatorToken = this.consume();
    if (operatorToken.kind !== 'operator' || !COMPARISON_OPERATORS.has(String(operatorToken.value))) {
      fail('expected a comparison operator (eq, ne, gt, ge, lt, le)', operatorToken.position);
    }
    const operator = String(operatorToken.value);
    const valueToken = this.consume();
    const value = this.validateValue(property, valueToken, operator);
    return `${property.name} ${operator} ${value}`;
  }

  private validateValue(property: EntityProperty, token: Token, operator: string): string {
    const kind = propertyKind(property.type);

    if (token.kind === 'null') {
      if (operator !== 'eq' && operator !== 'ne') {
        fail('null can only be used with eq or ne', token.position);
      }
      return 'null';
    }

    if (kind === 'binary' || kind === 'unknown') {
      fail(`field "${property.name}" cannot be used in a filter`, token.position);
    }

    if (kind === 'number') {
      if (token.kind !== 'number') fail(`field "${property.name}" requires a numeric value`, token.position);
      const value = token.value as number;
      const simpleType = property.type.replace(/^Edm\./, '');
      if (['Int16', 'Int32', 'Int64', 'Byte', 'SByte'].includes(simpleType) && !Number.isInteger(value)) {
        fail(`field "${property.name}" requires an integer value`, token.position);
      }
      return String(value);
    }

    if (kind === 'boolean') {
      if (token.kind !== 'boolean') fail(`field "${property.name}" requires true or false`, token.position);
      if (operator !== 'eq' && operator !== 'ne') {
        fail('boolean fields only support eq and ne', token.position);
      }
      return token.value === true ? 'true' : 'false';
    }

    // Strings, D365 enums, GUIDs and date/time values are all quoted in OData.
    if (token.kind !== 'string') {
      fail(`field "${property.name}" requires a quoted string value`, token.position);
    }
    const value = String(token.value);

    if (kind === 'guid') {
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)) {
        fail(`field "${property.name}" requires a GUID value`, token.position);
      }
    }

    if (kind === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(Date.parse(value))) {
        fail(`field "${property.name}" requires an ISO date/time value`, token.position);
      }
    }

    return escapeString(value);
  }
}

function escapeString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Parses a natural OData $filter expression, validates every field and value
 * against real D365 metadata, and rebuilds a canonical expression. The raw
 * input is never forwarded to D365, which prevents query option injection.
 */
export function buildFilter(input: string, resolveField: FilterFieldResolver): string {
  const trimmed = input.trim();
  if (!trimmed) throw new ValidationError('Filter cannot be empty.');
  if (trimmed.length > MAX_FILTER_LENGTH) {
    throw new ValidationError(`Filter is too long (maximum ${MAX_FILTER_LENGTH} characters).`);
  }
  const tokens = tokenize(trimmed);
  return new Parser(tokens, resolveField).parse();
}
