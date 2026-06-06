// =============================================================================
// Fluence Lead Scanner — Cloudflare Worker
// =============================================================================
// Bindings:
//   DB (D1) — lead database
//   JWT_SECRET (secret) — for signing auth tokens
// =============================================================================

import { createLead, getLead, updateLead, deleteLead, getStats, updateLeadAudio } from './db.js';
import { verifyPassword, hashPassword, createToken, verifyToken } from './auth.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ---- Public routes ----
      if (path === '/api/health') {
        return json({ status: 'ok', time: new Date().toISOString() }, corsHeaders);
      }

      if (path === '/api/auth/login' && method === 'POST') {
        return handleLogin(request, env, corsHeaders);
      }

      if (path === '/api/auth/register' && method === 'POST') {
        return handleRegister(request, env, corsHeaders);
      }

      // ---- Authenticated routes ----
      const auth = await authenticate(request, env);
      if (!auth) {
        return json({ error: 'Unauthorized' }, corsHeaders, 401);
      }

      // Leads CRUD
      if (path === '/api/leads' && method === 'GET') return listLeads(request, env, auth, corsHeaders);
      if (path === '/api/leads' && method === 'POST') return createLeadHandler(request, env, auth, corsHeaders);
      if (path === '/api/leads/export' && method === 'GET') return exportLeads(env, auth, corsHeaders);
      if (path.match(/^\/api\/leads\/\d+$/) && method === 'GET') return getLeadHandler(path, env, auth, corsHeaders);
      if (path.match(/^\/api\/leads\/\d+$/) && method === 'PUT') return updateLeadHandler(request, path, env, auth, corsHeaders);
      if (path.match(/^\/api\/leads\/\d+$/) && method === 'DELETE') return deleteLeadHandler(path, env, auth, corsHeaders);
      if (path.match(/^\/api\/leads\/\d+\/audio$/) && method === 'PUT') return updateLeadAudioHandler(request, path, env, auth, corsHeaders);
      if (path === '/api/leads/stats' && method === 'GET') return getStatsHandler(env, auth, corsHeaders);

      // Users
      if (path === '/api/users' && method === 'GET') return listUsers(env, auth, corsHeaders);
      if (path === '/api/users' && method === 'POST') return createUser(request, env, auth, corsHeaders);

      // Shows
      if (path === '/api/shows' && method === 'GET') return listShows(env, corsHeaders);
      if (path === '/api/shows' && method === 'POST') return createShow(request, env, auth, corsHeaders);

      return json({ error: 'Not Found' }, corsHeaders, 404);

    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: 'Internal Server Error', detail: err.message }, corsHeaders, 500);
    }
  }
};

// ======================== AUTH ========================

async function authenticate(request, env) {
  const header = request.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  return await verifyToken(token, env.JWT_SECRET);
}

// ======================== LOGIN ========================

async function handleLogin(request, env, corsHeaders) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return json({ error: 'Email and password required' }, corsHeaders, 400);
  }

  const { results } = await env.DB.prepare(
    'SELECT id, name, email, password_hash, role FROM users WHERE email = ?'
  ).bind(email.toLowerCase().trim()).all();

  if (!results.length) {
    return json({ error: 'Invalid credentials' }, corsHeaders, 401);
  }

  const user = results[0];
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return json({ error: 'Invalid credentials' }, corsHeaders, 401);
  }

  const token = await createToken(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    env.JWT_SECRET
  );

  return json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } }, corsHeaders);
}

async function handleRegister(request, env, corsHeaders) {
  const { name, email, password } = await request.json();
  if (!name || !email || !password || password.length < 6) {
    return json({ error: 'Name, email, and password (6+ chars) required' }, corsHeaders, 400);
  }

  const hash = await hashPassword(password);
  try {
    const { results } = await env.DB.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id, name, email, role'
    ).bind(name.trim(), email.toLowerCase().trim(), hash, 'rep').all();

    const user = results[0];
    const token = await createToken(user, env.JWT_SECRET);
    return json({ token, user }, corsHeaders, 201);
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return json({ error: 'Email already registered' }, corsHeaders, 409);
    }
    throw e;
  }
}

// ======================== LEADS ========================

async function listLeads(request, env, auth, corsHeaders) {
  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const temp = url.searchParams.get('temperature') || '';
  const showId = url.searchParams.get('show_id') || '';
  const assignedTo = url.searchParams.get('assigned_to') || '';

  const conditions = [];
  const params = [];

  // Reps see only their leads; admins see all
  if (auth.role !== 'admin') {
    conditions.push('l.user_id = ?');
    params.push(auth.id);
  }

  if (showId) { conditions.push('l.show_id = ?'); params.push(showId); }
  if (temp) { conditions.push('l.temperature = ?'); params.push(temp); }
  if (assignedTo) { conditions.push('l.assigned_to = ?'); params.push(assignedTo); }
  if (search) {
    conditions.push('(l.first_name LIKE ? OR l.last_name LIKE ? OR l.company LIKE ? OR l.email LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const { results } = await env.DB.prepare(
    `SELECT l.*, u.name AS owner_name FROM leads l JOIN users u ON l.user_id = u.id ${where} ORDER BY l.created_at DESC`
  ).bind(...params).all();

  return json({ leads: results }, corsHeaders);
}

async function createLeadHandler(request, env, auth, corsHeaders) {
  const data = await request.json();
  const lead = await createLead(env.DB, {
    ...data,
    user_id: auth.id,
    show_name: data.show_name || '',
  });
  return json({ lead }, corsHeaders, 201);
}

async function getLeadHandler(path, env, auth, corsHeaders) {
  const id = path.split('/').pop();
  const lead = await getLead(env.DB, id, auth);
  if (!lead) return json({ error: 'Not found' }, corsHeaders, 404);
  return json({ lead }, corsHeaders);
}

async function updateLeadHandler(request, path, env, auth, corsHeaders) {
  const id = path.split('/').pop();
  const data = await request.json();
  const lead = await updateLead(env.DB, id, data, auth);
  if (!lead) return json({ error: 'Not found' }, corsHeaders, 404);
  return json({ lead }, corsHeaders);
}

async function deleteLeadHandler(path, env, auth, corsHeaders) {
  const id = path.split('/').pop();
  const deleted = await deleteLead(env.DB, id, auth);
  if (!deleted) return json({ error: 'Not found' }, corsHeaders, 404);
  return json({ success: true }, corsHeaders);
}

async function updateLeadAudioHandler(request, path, env, auth, corsHeaders) {
  const id = path.split('/')[3]; // /api/leads/:id/audio
  const { voice_data } = await request.json();
  if (!voice_data) return json({ error: 'voice_data required' }, corsHeaders, 400);
  const ok = await updateLeadAudio(env.DB, id, voice_data, auth);
  if (ok === null) return json({ error: 'Not found' }, corsHeaders, 404);
  return json({ success: true }, corsHeaders);
}

async function getStatsHandler(env, auth, corsHeaders) {
  const stats = await getStats(env.DB, auth);
  return json({ stats }, corsHeaders);
}

async function exportLeads(env, auth, corsHeaders) {
  const where = auth.role !== 'admin' ? 'WHERE l.user_id = ?' : '';
  const params = auth.role !== 'admin' ? [auth.id] : [];
  const { results } = await env.DB.prepare(
    `SELECT l.*, u.name AS owner_name FROM leads l JOIN users u ON l.user_id = u.id ${where} ORDER BY l.created_at DESC`
  ).bind(...params).all();

  return json({ leads: results }, corsHeaders);
}

// ======================== USERS ========================

async function listUsers(env, auth, corsHeaders) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, email, role, created_at FROM users ORDER BY name'
  ).all();
  return json({ users: results }, corsHeaders);
}

async function createUser(request, env, auth, corsHeaders) {
  if (auth.role !== 'admin') {
    return json({ error: 'Admin only' }, corsHeaders, 403);
  }
  const { name, email, password, role } = await request.json();
  if (!name || !email || !password) {
    return json({ error: 'Name, email, password required' }, corsHeaders, 400);
  }
  const hash = await hashPassword(password);
  try {
    const { results } = await env.DB.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id, name, email, role'
    ).bind(name.trim(), email.toLowerCase().trim(), hash, role || 'rep').all();
    return json({ user: results[0] }, corsHeaders, 201);
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return json({ error: 'Email already exists' }, corsHeaders, 409);
    }
    throw e;
  }
}

// ======================== SHOWS ========================

async function listShows(env, corsHeaders) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM shows ORDER BY active DESC, name ASC'
  ).all();
  return json({ shows: results }, corsHeaders);
}

async function createShow(request, env, auth, corsHeaders) {
  if (auth.role !== 'admin') {
    return json({ error: 'Admin only' }, corsHeaders, 403);
  }
  const { name } = await request.json();
  if (!name) return json({ error: 'Name required' }, corsHeaders, 400);
  const { results } = await env.DB.prepare(
    'INSERT INTO shows (name) VALUES (?) RETURNING *'
  ).bind(name.trim()).all();
  return json({ show: results[0] }, corsHeaders, 201);
}

// ======================== HELPERS ========================

function json(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

