import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { generateToken, requireAuth, optionalAuth } from '../middleware/auth.js';
import { mockRes } from './helpers.js';

const SECRET = process.env.JWT_SECRET;

function reqWith(header) {
  return { headers: header === undefined ? {} : { authorization: header } };
}

describe('generateToken', () => {
  it('signs the user id with the configured secret', () => {
    const token = generateToken('user-42');
    const decoded = jwt.verify(token, SECRET);
    expect(decoded.userId).toBe('user-42');
  });

  it('expires after 7 days', () => {
    const decoded = jwt.decode(generateToken('u'));
    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
  });
});

describe('requireAuth', () => {
  it('rejects a request with no Authorization header', () => {
    const res = mockRes(); const next = vi.fn();
    requireAuth(reqWith(undefined), res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer scheme', () => {
    const res = mockRes(); const next = vi.fn();
    requireAuth(reqWith(`Basic ${generateToken('u')}`), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed with another secret', () => {
    const res = mockRes(); const next = vi.fn();
    requireAuth(reqWith(`Bearer ${jwt.sign({ userId: 'u' }, 'other')}`), res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign({ userId: 'u', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET);
    const res = mockRes(); const next = vi.fn();
    requireAuth(reqWith(`Bearer ${expired}`), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid token and sets req.userId', () => {
    const req = reqWith(`Bearer ${generateToken('user-7')}`);
    const res = mockRes(); const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe('user-7');
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('optionalAuth', () => {
  it('continues without a user when no header is present', () => {
    const req = reqWith(undefined); const next = vi.fn();
    optionalAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBeUndefined();
  });

  it('continues without a user when the token is invalid', () => {
    const req = reqWith('Bearer not-a-jwt'); const next = vi.fn();
    optionalAuth(req, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBeUndefined();
  });

  it('sets req.userId when the token is valid', () => {
    const req = reqWith(`Bearer ${generateToken('user-9')}`); const next = vi.fn();
    optionalAuth(req, mockRes(), next);
    expect(req.userId).toBe('user-9');
    expect(next).toHaveBeenCalledOnce();
  });
});
