/**
 * v0.32.0 - Pipe blocks: declarative logic chains
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { parse } from '../index.js';
import { compileBackend } from '../backend-compiler.js';
import { Validator } from '../validator.js';

function parsePipe(src) {
    const ast = parse(src);
    return ast.body.find(n => n.type === 'Pipe');
}

function compilePipe(src) {
    const ast = parse(src);
    const tables = ast.body.filter(n => n.type === 'Table');
    const pipes = ast.body.filter(n => n.type === 'Pipe');
    return compileBackend(tables, [], null, [], [], [], [], [], null, [], [], pipes);
}

function validatePipe(src) {
    const ast = parse(src);
    const v = new Validator();
    return v.validate(ast, new Set());
}

const TABLE_BLOCK = 'table orders {\n  email email required\n  total number\n  status text default "pending"\n}';

describe('pipe parsing - basic', () => {
    it('parses minimal pipe', () => {
        const pipe = parsePipe("pipe 'minimal' { }");
        assert.ok(pipe);
        assert.equal(pipe.type, 'Pipe');
        assert.equal(pipe.name, 'minimal');
        assert.equal(pipe.trigger, null);
        assert.deepEqual(pipe.steps, []);
    });

    it('parses pipe name', () => {
        const pipe = parsePipe("pipe 'order-flow' { log \"hello\" }");
        assert.equal(pipe.name, 'order-flow');
    });

    it('records line and col', () => {
        const pipe = parsePipe("pipe 'test' { }");
        assert.ok(pipe.line >= 1);
    });
});

describe('pipe parsing - triggers', () => {
    it('on api POST /path', () => {
        const pipe = parsePipe("pipe 'test' { on api POST /api/orders }");
        assert.equal(pipe.trigger.kind, 'api');
        assert.equal(pipe.trigger.method, 'POST');
        assert.equal(pipe.trigger.path, '/api/orders');
        assert.equal(pipe.trigger.auth, false);
    });

    it('on api GET /path auth', () => {
        const pipe = parsePipe("pipe 'test' { on api GET /api/users auth }");
        assert.equal(pipe.trigger.method, 'GET');
        assert.equal(pipe.trigger.auth, true);
    });

    it('on every 30s', () => {
        const pipe = parsePipe("pipe 'cron' { on every 30s }");
        assert.equal(pipe.trigger.kind, 'every');
        assert.equal(pipe.trigger.intervalMs, 30000);
    });

    it('on every 5m', () => {
        const pipe = parsePipe("pipe 'cron-m' { on every 5m }");
        assert.equal(pipe.trigger.intervalMs, 300000);
    });

    it('on every 1h', () => {
        const pipe = parsePipe("pipe 'cron-h' { on every 1h }");
        assert.equal(pipe.trigger.intervalMs, 3600000);
    });

    it('on webhook POST /hooks/stripe', () => {
        const pipe = parsePipe("pipe 'wh' { on webhook POST /hooks/stripe }");
        assert.equal(pipe.trigger.kind, 'webhook');
        assert.equal(pipe.trigger.method, 'POST');
    });

    it('on webhook with secret', () => {
        const pipe = parsePipe("pipe 'wh' { on webhook POST /hooks/stripe [secret=$STRIPE_SECRET] }");
        assert.equal(pipe.trigger.secret, '$STRIPE_SECRET');
    });

    it('on event table.created', () => {
        const pipe = parsePipe("pipe 'evt' { on event orders.created }");
        assert.equal(pipe.trigger.kind, 'event');
        assert.equal(pipe.trigger.table, 'orders');
        assert.equal(pipe.trigger.event, 'created');
    });
});

describe('pipe parsing - steps', () => {
    it('validate step', () => {
        const pipe = parsePipe("pipe 'v' {\n on api POST /test\n validate $body.email is email\n}");
        assert.equal(pipe.steps[0].type, 'PipeValidate');
        assert.equal(pipe.steps[0].fields[0].field, '$body.email');
    });

    it('validate with min/max', () => {
        const pipe = parsePipe("pipe 'v2' {\n on api POST /test\n validate $body.name is string [min=2, max=100]\n}");
        const checks = pipe.steps[0].fields[0].checks;
        assert.ok(checks.some(c => c.kind === 'string'));
        assert.ok(checks.some(c => c.kind === 'min' && c.value === '2'));
    });

    it('query step', () => {
        const pipe = parsePipe("pipe 'q' {\n on api GET /test\n query \"SELECT * FROM orders WHERE id = $id\"\n}");
        assert.equal(pipe.steps[0].type, 'PipeQuery');
    });

    it('query with as', () => {
        const pipe = parsePipe("pipe 'q2' {\n on api GET /test\n query \"SELECT * FROM orders\" as allOrders\n}");
        assert.equal(pipe.steps[0].as, 'allOrders');
    });

    it('fetch step', () => {
        const pipe = parsePipe("pipe 'f' {\n on api POST /test\n fetch \"https://api.example.com\" [timeout=5, method=GET] as apiData\n}");
        assert.equal(pipe.steps[0].type, 'PipeFetch');
        assert.equal(pipe.steps[0].options.timeout, '5');
    });

    it('set step', () => {
        const pipe = parsePipe("pipe 's' {\n on api POST /test\n set total = $price * $quantity\n}");
        assert.equal(pipe.steps[0].type, 'PipeSet');
        assert.equal(pipe.steps[0].name, 'total');
    });

    it('transform step', () => {
        const pipe = parsePipe("pipe 't' {\n on api POST /test\n transform { email: $body.email, total: $total }\n}");
        assert.equal(pipe.steps[0].type, 'PipeTransform');
        assert.equal(pipe.steps[0].fields.length, 2);
    });

    it('each step', () => {
        const pipe = parsePipe("pipe 'e' {\n on api GET /test\n query \"SELECT * FROM orders\" as rows\n each $rows as order {\n log \"order\"\n }\n}");
        const each = pipe.steps[1];
        assert.equal(each.type, 'PipeEach');
        assert.equal(each.collection, '$rows');
        assert.equal(each.itemName, 'order');
    });

    it('when step', () => {
        const pipe = parsePipe("pipe 'w' {\n on api POST /test\n when $total > 100 {\n log \"big order\"\n }\n}");
        assert.equal(pipe.steps[0].type, 'PipeWhen');
    });

    it('when/else step', () => {
        const pipe = parsePipe("pipe 'we' {\n on api POST /test\n when $total > 100 {\n log \"big\"\n } else {\n log \"small\"\n }\n}");
        assert.ok(pipe.steps[0].elseBody);
        assert.equal(pipe.steps[0].elseBody.length, 1);
    });

    it('notify email step', () => {
        const pipe = parsePipe("pipe 'n' {\n on api POST /test\n notify email to=$email subject=\"Hello\" body=\"World\"\n}");
        assert.equal(pipe.steps[0].type, 'PipeNotify');
        assert.equal(pipe.steps[0].channel, 'email');
    });

    it('notify sms step', () => {
        const pipe = parsePipe("pipe 'ns' {\n on api POST /test\n notify sms to=$phone message=\"hi\"\n}");
        assert.equal(pipe.steps[0].channel, 'sms');
    });

    it('log step', () => {
        const pipe = parsePipe("pipe 'l' {\n on api GET /test\n log \"hello world\"\n}");
        assert.equal(pipe.steps[0].type, 'PipeLog');
        assert.equal(pipe.steps[0].message, 'hello world');
    });

    it('respond step', () => {
        const pipe = parsePipe("pipe 'r' {\n on api POST /test\n respond 201 { id: $id, status: created }\n}");
        assert.equal(pipe.steps[0].type, 'PipeRespond');
        assert.equal(pipe.steps[0].status, 201);
    });

    it('abort step', () => {
        const pipe = parsePipe("pipe 'a' {\n on api POST /test\n abort 403 \"Forbidden\"\n}");
        assert.equal(pipe.steps[0].type, 'PipeAbort');
        assert.equal(pipe.steps[0].status, 403);
    });

    it('webhook step', () => {
        const pipe = parsePipe("pipe 'wh' {\n on api POST /test\n webhook \"https://hooks.slack.com/xyz\"\n}");
        assert.equal(pipe.steps[0].type, 'PipeWebhook');
    });

    it('run pipe step', () => {
        const pipe = parsePipe("pipe 'main' {\n on api POST /test\n run pipe 'sub-pipe'\n}");
        assert.equal(pipe.steps[0].type, 'PipeRun');
        assert.equal(pipe.steps[0].pipeName, 'sub-pipe');
    });

    it('run pipe with params', () => {
        const pipe = parsePipe("pipe 'main' {\n on api POST /test\n run pipe 'sub-pipe' with { email: $body.email }\n}");
        assert.ok(pipe.steps[0].withParams);
    });
});

describe('pipe compilation - api trigger', () => {
    it('generates Express route', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'create-order' {\n on api POST /api/orders\n log \"received\"\n respond 201 { ok: true }\n}");
        assert.match(code, /app\.post\('\/api\/orders'/);
        assert.match(code, /async function pipe_create_order/);
    });

    it('auth middleware', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'p' {\n on api GET /api/p auth\n respond 200 { ok: true }\n}");
        assert.match(code, /authMiddleware/);
    });
});

describe('pipe compilation - every trigger', () => {
    it('generates setInterval', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'cleanup' {\n on every 60s\n query \"DELETE FROM orders WHERE status = 'expired'\"\n}");
        assert.match(code, /setInterval/);
        assert.match(code, /60000/);
    });
});

describe('pipe compilation - webhook trigger', () => {
    it('rate limiter', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'wh' {\n on webhook POST /hooks/stripe\n log \"received\"\n}");
        assert.match(code, /webhookLimiter/);
    });

    it('signature verification', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'wh' {\n on webhook POST /hooks/s [secret=$WH_SECRET]\n log \"ok\"\n}");
        assert.match(code, /createHmac/);
        assert.match(code, /Invalid signature/);
    });
});

describe('pipe compilation - validate', () => {
    it('email validation', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'v' {\n on api POST /api/t\n validate $body.email is email\n}");
        assert.match(code, /must be a valid email/);
    });

    it('url validation', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'v' {\n on api POST /api/t\n validate $body.url is url\n}");
        assert.match(code, /must be a valid URL/);
    });

    it('number validation', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'v' {\n on api POST /api/t\n validate $body.age is number\n}");
        assert.match(code, /must be a number/);
    });
});

describe('pipe compilation - query security', () => {
    it('parameterized queries', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'q' {\n on api POST /api/t\n query \"INSERT INTO orders (email) VALUES ($email)\"\n}");
        assert.match(code, /VALUES \(\?\)/);
        assert.match(code, /ctx\.email/);
    });

    it('.all() for SELECT', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'q' {\n on api GET /api/t\n query \"SELECT * FROM orders WHERE email = $email\"\n}");
        assert.match(code, /\.all\(/);
    });

    it('.run() for INSERT', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'q' {\n on api POST /api/t\n query \"INSERT INTO orders (email) VALUES ($email)\"\n}");
        assert.match(code, /\.run\(/);
    });
});

describe('pipe compilation - fetch', () => {
    it('fetch with timeout', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'f' {\n on api POST /api/t\n fetch \"https://api.example.com\" [timeout=5] as data\n}");
        assert.match(code, /AbortSignal\.timeout\(5000\)/);
    });
});

describe('pipe compilation - set and transform', () => {
    it('set assignment', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 's' {\n on api POST /api/t\n set total = $price * 1.19\n}");
        assert.match(code, /ctx\.total = ctx\.price \* 1\.19/);
    });

    it('transform object', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 't' {\n on api POST /api/t\n transform { email: $body.email, total: $total }\n}");
        assert.match(code, /ctx\.result = \{/);
    });
});

describe('pipe compilation - each loop', () => {
    it('for loop', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'e' {\n on api GET /api/t\n query \"SELECT * FROM orders\" as rows\n each $rows as order {\n log \"processing\"\n }\n}");
        assert.match(code, /for \(const order of ctx\.rows\)/);
    });
});

describe('pipe compilation - when', () => {
    it('if block', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'w' {\n on api POST /api/t\n when $total > 100 {\n log \"big\"\n }\n}");
        assert.match(code, /if \(ctx\.total > 100\)/);
    });

    it('if/else', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'w' {\n on api POST /api/t\n when $total > 100 {\n log \"big\"\n } else {\n log \"small\"\n }\n}");
        assert.match(code, /\} else \{/);
    });
});

describe('pipe compilation - notify', () => {
    it('sendEmail', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'n' {\n on api POST /api/t\n notify email to=$email subject=\"Hi\" body=\"Hello\"\n}");
        assert.match(code, /await sendEmail\(/);
    });

    it('sendSms', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'n' {\n on api POST /api/t\n notify sms to=$phone message=\"Hello\"\n}");
        assert.match(code, /await sendSms\(/);
    });
});

describe('pipe compilation - log/respond/abort', () => {
    it('console.log prefix', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'l' {\n on api GET /api/t\n log \"test\"\n}");
        assert.match(code, /console\.log\('\[pipe:l\]'/);
    });

    it('respond', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'r' {\n on api POST /api/t\n respond 201 { ok: true }\n}");
        assert.match(code, /ctx\.res\?\.status\(201\)\.json/);
    });

    it('abort', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'a' {\n on api POST /api/t\n abort 400 \"Bad request\"\n}");
        assert.match(code, /status\(400\)/);
        assert.match(code, /Bad request/);
    });
});

describe('pipe compilation - run pipe', () => {
    it('calls pipe function', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'sub' {\n on api GET /api/sub\n log \"sub\"\n}\npipe 'main' {\n on api POST /api/main\n run pipe 'sub'\n}");
        assert.match(code, /await pipe_sub\(ctx\)/);
    });
});

describe('pipe compilation - on change', () => {
    it('_pipe_state table', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'sc' {\n on api PUT /api/orders\n on change $status {\n pending -> shipped {\n log \"shipped\"\n }\n }\n}");
        assert.match(code, /_pipe_state/);
        assert.match(code, /INSERT OR REPLACE INTO _pipe_state/);
    });
});

describe('pipe validation', () => {
    it('warns: no trigger', () => {
        const results = validatePipe("pipe 'no-trigger' { log \"hello\" }");
        assert.ok(results.some(w => w.message.includes('no trigger')));
    });

    it('warns: sms without twilio', () => {
        const results = validatePipe("pipe 'sms' {\n on api POST /t\n notify sms to=$phone message=\"hi\"\n}");
        assert.ok(results.some(w => w.message.includes('twilio')));
    });

    it('warns: email without nodemailer', () => {
        const results = validatePipe("pipe 'em' {\n on api POST /t\n notify email to=$e subject=\"hi\" body=\"hi\"\n}");
        assert.ok(results.some(w => w.message.includes('nodemailer')));
    });

    it('warns: respond with every trigger', () => {
        const results = validatePipe("pipe 'er' {\n on every 30s\n respond 200 { ok: true }\n}");
        assert.ok(results.some(w => w.message.includes('respond')));
    });

    it('warns: query $body without validate (security)', () => {
        const results = validatePipe("pipe 'u' {\n on api POST /t\n query \"INSERT INTO t (e) VALUES ($body.email)\"\n}");
        assert.ok(results.some(w => w.message.includes('security')));
    });

    it('warns: fetch $variable (SSRF)', () => {
        const results = validatePipe("pipe 'ssrf' {\n on api POST /t\n fetch $body.url\n}");
        assert.ok(results.some(w => w.message.includes('SSRF')));
    });

    it('no warn: validate precedes query', () => {
        const results = validatePipe("pipe 's' {\n on api POST /t\n validate $body.email is email\n query \"INSERT INTO t (e) VALUES ($body.email)\"\n}");
        assert.ok(!results.some(w => w.message.includes('security')));
    });
});

describe('multiple pipes', () => {
    it('parses multiple', () => {
        const ast = parse("pipe 'first' {\n on api GET /api/first\n log \"first\"\n}\npipe 'second' {\n on api POST /api/second\n log \"second\"\n}\npipe 'third' {\n on every 30s\n log \"third\"\n}");
        const pipes = ast.body.filter(n => n.type === 'Pipe');
        assert.equal(pipes.length, 3);
    });

    it('compiles multiple', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'api-pipe' {\n on api POST /api/test\n log \"api\"\n respond 200 { ok: true }\n}\npipe 'cron-pipe' {\n on every 60s\n log \"cron\"\n}");
        assert.match(code, /pipe_api_pipe/);
        assert.match(code, /pipe_cron_pipe/);
    });
});

describe('pipe integration - full workflow', () => {
    it('complete order pipe', () => {
        const src = TABLE_BLOCK + "\npipe 'process-order' {\n on api POST /api/orders auth\n validate $body.email is email\n validate $body.total is number [min=1]\n set tax = $body.total * 0.19\n set grandTotal = $body.total + $tax\n query \"INSERT INTO orders (email, total) VALUES ($body.email, $grandTotal)\" as result\n transform { id: $result.lastInsertRowid, email: $body.email, total: $grandTotal }\n when $grandTotal > 100 {\n log \"Premium order\"\n webhook \"https://hooks.slack.com/notify\"\n }\n respond 201 { id: $result.lastInsertRowid, total: $grandTotal }\n}";
        const pipe = parsePipe(src);
        assert.equal(pipe.name, 'process-order');
        assert.equal(pipe.trigger.kind, 'api');
        assert.equal(pipe.trigger.auth, true);
        assert.ok(pipe.steps.length >= 7);

        const code = compilePipe(src);
        assert.match(code, /async function pipe_process_order/);
        assert.match(code, /authMiddleware/);
        assert.match(code, /must be a valid email/);
        assert.match(code, /ctx\.tax/);
        assert.match(code, /db\.prepare/);
        assert.match(code, /VALUES \(\?, \?\)/);
        assert.match(code, /ctx\.res\?\.status\(201\)/);
    });
});

describe('pipe error handling', () => {
    it('try/catch wrapper', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'safe' {\n on api POST /api/t\n log \"hello\"\n}");
        assert.match(code, /try \{/);
        assert.match(code, /catch\(e\)/);
        assert.match(code, /Internal pipe error/);
    });

    it('checks headersSent', () => {
        const code = compilePipe(TABLE_BLOCK + "\npipe 'safe' {\n on api POST /api/t\n log \"hello\"\n}");
        assert.match(code, /headersSent/);
    });
});
