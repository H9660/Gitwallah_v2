import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { mockRes, chain } from './helpers.js';

vi.mock('../models/User.js', () => {
  const User = vi.fn(function (doc) {
    Object.assign(this, doc, { _id: 'new-id', stats: { solved: 0 } });
    this.save = vi.fn().mockResolvedValue(this);
  });
  User.findOne = vi.fn();
  User.findById = vi.fn();
  User.hashPassword = vi.fn(async (p) => `hashed:${p}`);
  return { default: User };
});
vi.mock('../models/ChallengeResult.js', () => ({ default: { find: vi.fn() } }));

const { default: User } = await import('../models/User.js');
const { default: ChallengeResult } = await import('../models/ChallengeResult.js');
const { registerUser, loginUser, getUser, getProfile } = await import('../controllers/userController.js');

beforeEach(() => vi.clearAllMocks());

describe('registerUser', () => {
  it.each([
    [{ email: 'a@x.io', password: 'p' }],
    [{ username: 'alice', password: 'p' }],
    [{ username: 'alice', email: 'a@x.io' }],
  ])('rejects missing fields %#', async (body) => {
    const res = mockRes();
    await registerUser({ body }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'All fields required' });
  });

  it('rejects a duplicate username or email', async () => {
    User.findOne.mockResolvedValue({ _id: 'x' });
    const res = mockRes();
    await registerUser({ body: { username: 'alice', email: 'a@x.io', password: 'p' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('User already exists');
    expect(User.findOne).toHaveBeenCalledWith({ $or: [{ username: 'alice' }, { email: 'a@x.io' }] });
  });

  it('stores a hashed password and returns a token without the hash', async () => {
    User.findOne.mockResolvedValue(null);
    const res = mockRes();
    await registerUser({ body: { username: 'alice', email: 'a@x.io', password: 'pw' } }, res);
    expect(res.statusCode).toBe(200);
    expect(User).toHaveBeenCalledWith({ username: 'alice', email: 'a@x.io', passwordHash: 'hashed:pw' });
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET).userId).toBe('new-id');
    expect(res.body.user).toEqual({ id: 'new-id', username: 'alice', email: 'a@x.io', stats: { solved: 0 } });
    expect(JSON.stringify(res.body)).not.toContain('hashed:pw');
  });

  it('returns 500 when the database fails', async () => {
    User.findOne.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await registerUser({ body: { username: 'a', email: 'b', password: 'c' } }, res);
    expect(res.statusCode).toBe(500);
  });
});

describe('loginUser', () => {
  it('rejects an unknown email', async () => {
    User.findOne.mockResolvedValue(null);
    const res = mockRes();
    await loginUser({ body: { email: 'no@x.io', password: 'p' } }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  it('rejects a wrong password with the same message', async () => {
    User.findOne.mockResolvedValue({ comparePassword: vi.fn().mockResolvedValue(false) });
    const res = mockRes();
    await loginUser({ body: { email: 'a@x.io', password: 'bad' } }, res);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  it('returns a token for the right password', async () => {
    User.findOne.mockResolvedValue({ _id: 'u1', username: 'alice', stats: {}, comparePassword: vi.fn().mockResolvedValue(true) });
    const res = mockRes();
    await loginUser({ body: { email: 'a@x.io', password: 'good' } }, res);
    expect(res.statusCode).toBe(200);
    expect(jwt.verify(res.body.token, process.env.JWT_SECRET).userId).toBe('u1');
    expect(res.body.user.username).toBe('alice');
  });
});

describe('getUser / getProfile', () => {
  it('getUser returns 404 for an unknown user', async () => {
    User.findById.mockReturnValue(chain(null));
    const res = mockRes();
    await getUser({ userId: 'u' }, res);
    expect(res.statusCode).toBe(404);
  });

  it('getUser excludes the password hash', async () => {
    const q = chain({ username: 'alice' });
    User.findById.mockReturnValue(q);
    const res = mockRes();
    await getUser({ userId: 'u' }, res);
    expect(q.select).toHaveBeenCalledWith('-passwordHash');
    expect(res.body).toEqual({ user: { username: 'alice' } });
  });

  it('getProfile returns the 20 most recent results, newest first', async () => {
    User.findById.mockReturnValue(chain({ _id: 'u1', username: 'alice' }));
    const history = chain([{ title: 't' }]);
    ChallengeResult.find.mockReturnValue(history);
    const res = mockRes();
    await getProfile({ userId: 'u1' }, res);
    expect(ChallengeResult.find).toHaveBeenCalledWith({ userId: 'u1' });
    expect(history.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(history.limit).toHaveBeenCalledWith(20);
    expect(res.body.history).toEqual([{ title: 't' }]);
  });
});
