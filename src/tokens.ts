/**
 * NyxCode Token Types
 * 
 * Every token the lexer can produce. Kept minimal — 
 * NyxCode has few syntactic constructs by design.
 */

export enum TokenType {
  // Literals
  String = 'String',
  Number = 'Number',
  Identifier = 'Identifier',

  // Keywords
  Page = 'Page',
  Component = 'Component',
  Data = 'Data',
  Each = 'Each',
  When = 'When',
  Else = 'Else',
  Style = 'Style',
  Auth = 'Auth',
  Form = 'Form',
  Api = 'Api',
  Query = 'Query',
  Table = 'Table',
  Store = 'Store',
  On = 'On',
  Raw = 'Raw',
  Theme = 'Theme',
  Props = 'Props',
  Validate = 'Validate',
  Respond = 'Respond',
  Limit = 'Limit',
  Security = 'Security',
  Animate = 'Animate',
  State = 'State',
  Effect = 'Effect',
  Computed = 'Computed',
  Use = 'Use',
  Head = 'Head',
  Layout = 'Layout',
  Script = 'Script',
  Preset = 'Preset',
  Config = 'Config',
  Before = 'Before',
  After = 'After',
  Keyframes = 'Keyframes',
  Every = 'Every',
  Action = 'Action',
  Let = 'Let',
  Const = 'Const',
  Env = 'Env',
  Email = 'Email',
  PipeBlock = 'PipeBlock',

  // v0.37: logic + arithmetic operators
  And = 'And',
  Or = 'Or',
  Not = 'Not',
  Plus = 'Plus',           // +
  Minus = 'Minus',         // -
  Star = 'Star',           // *
  Percent = 'Percent',     // %
  In = 'In',               // in (for each x in items)
  Await = 'Await',
  Import = 'Import',
  From = 'From',
  As = 'As',
  If = 'If',
  ElseIf = 'ElseIf',

  // v0.34: fn, match, type, try/catch, test, defer, throw, return
  Stream = 'Stream',
  Fn = 'Fn',
  Match = 'Match',
  Return = 'Return',
  Type = 'Type',
  Try = 'Try',
  Catch = 'Catch',
  Defer = 'Defer',
  Test = 'Test',
  Throw = 'Throw',
  Rate = 'Rate',
  Expect = 'Expect',

  // Operators & Punctuation
  LeftBrace = 'LeftBrace',       // {
  RightBrace = 'RightBrace',     // }
  LeftParen = 'LeftParen',       // (
  RightParen = 'RightParen',     // )
  LeftBracket = 'LeftBracket',   // [
  RightBracket = 'RightBracket', // ]
  Arrow = 'Arrow',               // ->
  Dot = 'Dot',                   // .
  Comma = 'Comma',               // ,
  Equals = 'Equals',             // =
  DoubleEquals = 'DoubleEquals', // ==
  NotEquals = 'NotEquals',       // !=
  LessThan = 'LessThan',        // <
  GreaterThan = 'GreaterThan',   // >
  LessEquals = 'LessEquals',     // <=
  GreaterEquals = 'GreaterEquals', // >=
  Ampersand = 'Ampersand',       // &
  Pipe = 'Pipe',                 // |
  Bang = 'Bang',                 // !
  Dollar = 'Dollar',             // $
  Question = 'Question',         // ?
  DotDot = 'DotDot',            // ..
  Slash = 'Slash',              // /
  Colon = 'Colon',              // :
  At = 'At',                    // @

  // Special
  Newline = 'Newline',
  EOF = 'EOF',
}

/** Map of keyword strings to their token types */
export const KEYWORDS: Record<string, TokenType> = {
  page: TokenType.Page,
  component: TokenType.Component,
  data: TokenType.Data,
  each: TokenType.Each,
  when: TokenType.When,
  else: TokenType.Else,
  style: TokenType.Style,
  auth: TokenType.Auth,
  form: TokenType.Form,
  api: TokenType.Api,
  query: TokenType.Query,
  table: TokenType.Table,
  store: TokenType.Store,
  on: TokenType.On,
  raw: TokenType.Raw,
  theme: TokenType.Theme,
  props: TokenType.Props,
  validate: TokenType.Validate,
  respond: TokenType.Respond,
  limit: TokenType.Limit,
  security: TokenType.Security,
  animate: TokenType.Animate,
  state: TokenType.State,
  effect: TokenType.Effect,
  computed: TokenType.Computed,
  use: TokenType.Use,
  head: TokenType.Head,
  layout: TokenType.Layout,
  script: TokenType.Script,
  preset: TokenType.Preset,
  config: TokenType.Config,
  before: TokenType.Before,
  after: TokenType.After,
  keyframes: TokenType.Keyframes,
  every: TokenType.Every,
  action: TokenType.Action,
  let: TokenType.Let,
  const: TokenType.Const,
  env: TokenType.Env,
  email: TokenType.Email,
  pipe: TokenType.PipeBlock,

  // v0.37: logic + control
  and: TokenType.And,
  or: TokenType.Or,
  not: TokenType.Not,
  in: TokenType.In,
  await: TokenType.Await,
  import: TokenType.Import,
  from: TokenType.From,
  as: TokenType.As,
  if: TokenType.If,

  // v0.34+: full programming language keywords
  stream: TokenType.Stream,
  fn: TokenType.Fn,
  match: TokenType.Match,
  return: TokenType.Return,
  type: TokenType.Type,
  try: TokenType.Try,
  catch: TokenType.Catch,
  defer: TokenType.Defer,
  rate: TokenType.Rate,
  expect: TokenType.Expect,
  test: TokenType.Test,
  throw: TokenType.Throw,
};

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}
