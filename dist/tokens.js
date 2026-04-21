/**
 * NyxCode Token Types
 *
 * Every token the lexer can produce. Kept minimal —
 * NyxCode has few syntactic constructs by design.
 */
export var TokenType;
(function (TokenType) {
    // Literals
    TokenType["String"] = "String";
    TokenType["Number"] = "Number";
    TokenType["Identifier"] = "Identifier";
    // Keywords
    TokenType["Page"] = "Page";
    TokenType["Component"] = "Component";
    TokenType["Data"] = "Data";
    TokenType["Each"] = "Each";
    TokenType["When"] = "When";
    TokenType["Else"] = "Else";
    TokenType["Style"] = "Style";
    TokenType["Auth"] = "Auth";
    TokenType["Form"] = "Form";
    TokenType["Api"] = "Api";
    TokenType["Query"] = "Query";
    TokenType["Table"] = "Table";
    TokenType["Store"] = "Store";
    TokenType["On"] = "On";
    TokenType["Raw"] = "Raw";
    TokenType["Theme"] = "Theme";
    TokenType["Props"] = "Props";
    TokenType["Validate"] = "Validate";
    TokenType["Respond"] = "Respond";
    TokenType["Limit"] = "Limit";
    TokenType["Security"] = "Security";
    TokenType["Animate"] = "Animate";
    TokenType["State"] = "State";
    TokenType["Effect"] = "Effect";
    TokenType["Computed"] = "Computed";
    TokenType["Use"] = "Use";
    TokenType["Head"] = "Head";
    TokenType["Layout"] = "Layout";
    TokenType["Script"] = "Script";
    TokenType["Preset"] = "Preset";
    TokenType["Config"] = "Config";
    TokenType["Before"] = "Before";
    TokenType["After"] = "After";
    TokenType["Keyframes"] = "Keyframes";
    TokenType["Every"] = "Every";
    TokenType["Action"] = "Action";
    TokenType["Let"] = "Let";
    TokenType["Env"] = "Env";
    TokenType["Email"] = "Email";
    TokenType["PipeBlock"] = "PipeBlock";
    // Operators & Punctuation
    TokenType["LeftBrace"] = "LeftBrace";
    TokenType["RightBrace"] = "RightBrace";
    TokenType["LeftParen"] = "LeftParen";
    TokenType["RightParen"] = "RightParen";
    TokenType["LeftBracket"] = "LeftBracket";
    TokenType["RightBracket"] = "RightBracket";
    TokenType["Arrow"] = "Arrow";
    TokenType["Dot"] = "Dot";
    TokenType["Comma"] = "Comma";
    TokenType["Equals"] = "Equals";
    TokenType["DoubleEquals"] = "DoubleEquals";
    TokenType["NotEquals"] = "NotEquals";
    TokenType["LessThan"] = "LessThan";
    TokenType["GreaterThan"] = "GreaterThan";
    TokenType["LessEquals"] = "LessEquals";
    TokenType["GreaterEquals"] = "GreaterEquals";
    TokenType["Ampersand"] = "Ampersand";
    TokenType["Pipe"] = "Pipe";
    TokenType["Bang"] = "Bang";
    TokenType["Dollar"] = "Dollar";
    TokenType["Question"] = "Question";
    TokenType["DotDot"] = "DotDot";
    TokenType["Slash"] = "Slash";
    TokenType["Colon"] = "Colon";
    TokenType["At"] = "At";
    // Special
    TokenType["Newline"] = "Newline";
    TokenType["EOF"] = "EOF";
})(TokenType || (TokenType = {}));
/** Map of keyword strings to their token types */
export const KEYWORDS = {
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
    env: TokenType.Env,
    email: TokenType.Email,
    pipe: TokenType.PipeBlock,
};
//# sourceMappingURL=tokens.js.map