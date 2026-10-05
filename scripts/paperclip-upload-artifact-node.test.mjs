// Local fixtures only: exercise the real Bash helper and curl without jq.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const helper = path.resolve('skills/paperclip/scripts/paperclip-upload-artifact.sh').replaceAll('\\', '/');
const bash = process.env.PAPERCLIP_TEST_BASH || process.env.SHELL || 'bash';
async function harness(t, behavior = {}) {
  const root = await fs.mkdtemp(path.join(process.env.PAPERCLIP_RUN_SCRATCH_DIR || process.env.PAPERCLIP_SCRATCH_DIR || process.env.TMPDIR || os.tmpdir(), 'artifact-node-test-'));
  const file = path.join(root, 'result.txt').replaceAll('\\', '/');
  await fs.writeFile(file, '한국어 첨부 시험\n');
  const attachment = {
    id: 'fixture-attachment', originatingRunId: 'fixture-run', originalFilename: 'result.txt', contentType: 'text/plain', byteSize: (await fs.stat(file)).size,
    sha256: createHash('sha256').update(await fs.readFile(file)).digest('hex'), contentPath: '/api/attachments/fixture-attachment/content',
  };
  const state = { attachments: [], uploads: 0, products: [], comments: [] };
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    assert.equal(req.headers.authorization, 'Bearer fixture-token');
    assert.equal(req.headers['x-paperclip-run-id'], 'fixture-run');
    const send = (status, value) => { res.writeHead(status, {'Content-Type': 'application/json'}); res.end(JSON.stringify(value)); };
    if (req.method === 'GET' && req.url.endsWith('/attachments')) return send(200, state.attachments);
    if (req.method === 'POST' && req.url.endsWith('/attachments')) {
      state.uploads++;
      if (behavior.permanent) return send(400, {error: 'fixture rejection'});
      if (behavior.delay) await new Promise(resolve => setTimeout(resolve, 120));
      state.attachments.push(attachment);
      if (behavior.ambiguous && state.uploads === 1) return send(409, {outcome: 'indeterminate'});
      return send(201, behavior.malformed ? {id: attachment.id} : attachment);
    }
    if (req.url.endsWith('/work-products')) { const product = JSON.parse(body); state.products.push(product); return send(201, {...product, id: 'fixture-product'}); }
    if (req.url.endsWith('/comments')) { const comment = JSON.parse(body); state.comments.push(comment); return send(201, {...comment, id: 'fixture-comment'}); }
    send(404, {error: 'unexpected fixture route'});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(root, {recursive: true, force: true}); });
  const env = {...process.env, PAPERCLIP_API_URL: `http://127.0.0.1:${server.address().port}/api`, PAPERCLIP_API_KEY: 'fixture-token', PAPERCLIP_RUN_ID: 'fixture-run', PAPERCLIP_TASK_ID: 'fixture-issue', PAPERCLIP_COMPANY_ID: 'fixture-company', PAPERCLIP_HELPER_STATE_DIR: path.join(root, 'locks').replaceAll('\\', '/'), TMPDIR: root.replaceAll('\\', '/')};
  async function run(...args) {
    return new Promise((resolve, reject) => {
      const child = spawn(bash, [helper, file, ...args], {env});
      let stdout = '', stderr = '';
      child.stdout.on('data', data => stdout += data); child.stderr.on('data', data => stderr += data);
      child.on('error', reject); child.on('close', code => resolve({code, stdout, stderr}));
    });
  }
  return {run, state, attachment};
}

test('dry-run preserves Korean, quotes, newline and explicit false flags', async t => {
  const h = await harness(t);
  const r = await h.run('--dry-run', '--title', '한국어 "제목"', '--summary', '첫 줄\n둘째 줄', '--no-work-product', '--no-primary');
  assert.equal(r.code, 0, r.stderr); const data = JSON.parse(r.stdout);
  assert.equal(data.title, '한국어 "제목"'); assert.equal(data.summary, '첫 줄\n둘째 줄');
  assert.equal(data.createWorkProduct, false); assert.equal(data.isPrimary, false); assert.equal(h.state.uploads, 0);
});
test('upload, work product, Korean JSON and optional comment binding succeed', async t => {
  const h = await harness(t); const r = await h.run('--output', 'json', '--title', '한국어 제목', '--summary', '요약\n다음 줄', '--chat-comment', '첨부 시험');
  assert.equal(r.code, 0, r.stderr); const data = JSON.parse(r.stdout);
  assert.equal(data.workProduct.title, '한국어 제목'); assert.equal(data.workProduct.summary, '요약\n다음 줄');
  assert.equal(data.workProduct.metadata.downloadPath, h.attachment.contentPath + '?download=1');
  assert.equal(data.workProduct.metadata.openPath, h.attachment.contentPath); assert.equal(data.chatComment.body, '첨부 시험');
  assert.equal(h.state.uploads, 1); assert.equal(h.state.products.length, 1);
});
test('same-run retry reuses attachment and releases lock', async t => {
  const h = await harness(t); assert.equal((await h.run()).code, 0); const r = await h.run();
  assert.equal(r.code, 0, r.stderr); assert.match(r.stdout, /Reused matching artifact/); assert.equal(h.state.uploads, 1);
});
test('concurrent matching uploads serialize without symlink privileges', async t => {
  const h = await harness(t, {delay: true}); const results = await Promise.all([h.run('--output', 'json'), h.run('--output', 'json')]);
  for (const r of results) assert.equal(r.code, 0, r.stderr);
  assert.equal(h.state.uploads, 1);
});
test('ambiguous 409 is reconciled by listing, not duplicated', async t => {
  const h = await harness(t, {ambiguous: true}); assert.equal((await h.run()).code, 1);
  const r = await h.run(); assert.equal(r.code, 0, r.stderr); assert.equal(h.state.uploads, 1);
});
test('permanent upload rejection is not reported as success', async t => {
  const h = await harness(t, {permanent: true}); const r = await h.run();
  assert.equal(r.code, 1); assert.match(r.stderr, /Upload failed \(400\)/); assert.equal(h.state.products.length, 0);
});
test('malformed success keeps uncertain marker and reuses durable record on retry', async t => {
  const h = await harness(t, {malformed: true}); const first = await h.run();
  assert.equal(first.code, 1); assert.match(first.stderr, /path metadata/);
  assert.equal((await h.run()).code, 0); assert.equal(h.state.uploads, 1);
});
test('no-work-product produces null and markdown output handles null safely', async t => {
  const h = await harness(t); const first = await h.run('--no-work-product', '--output', 'json');
  assert.equal(first.code, 0, first.stderr); assert.equal(JSON.parse(first.stdout).workProduct, null);
  const next = await h.run('--no-work-product'); assert.equal(next.code, 0, next.stderr); assert.doesNotMatch(next.stdout, /Work product ID/);
});
test('comment binding without work product is rejected before API mutation', async t => {
  const h = await harness(t); const r = await h.run('--no-work-product', '--chat-comment', '불가');
  assert.equal(r.code, 1); assert.equal(h.state.uploads, 0);
});
