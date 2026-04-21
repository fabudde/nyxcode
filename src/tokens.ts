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
};

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}
