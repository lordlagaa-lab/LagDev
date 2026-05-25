// =============================================================================
// Fluence Lead Scanner — D1 Database Layer
// =============================================================================

/**
 * Create a new lead
 */
export async function createLead(DB, data) {
  const products = Array.isArray(data.products) ? JSON.stringify(data.products) : (data.products || '[]');

  const { results } = await DB.prepare(`
    INSERT INTO leads (user_id, show_id, first_name, last_name, title, company,
      email, phone, country, linkedin, temperature, deal_size, timeline,
      products, notes, assigned_to, next_action, due_date, priority, transcript, show_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).bind(
    data.user_id,
    data.show_id || null,
    data.first_name || '',
    data.last_name || '',
    data.title || '',
    data.company || '',
    data.email || '',
    data.phone || '',
    data.country || '',
    data.linkedin || '',
    data.temperature || '',
    data.deal_size || '',
    data.timeline || '',
    products,
    data.notes || '',
    data.assigned_to || '',
    data.next_action || '',
    data.due_date || '',
    data.priority || '',
    data.transcript || '',
    data.show_name || ''
  ).all();

  return results[0];
}

/**
 * Get a single lead
 */
export async function getLead(DB, id, auth) {
  const where = auth.role !== 'admin' ? 'AND l.user_id = ?' : '';
  const params = auth.role !== 'admin' ? [id, auth.id] : [id];

  const { results } = await DB.prepare(
    `SELECT l.*, u.name AS owner_name FROM leads l
     JOIN users u ON l.user_id = u.id
     WHERE l.id = ? ${where}`
  ).bind(...params).all();

  return results[0] || null;
}

/**
 * Update a lead
 */
export async function updateLead(DB, id, data, auth) {
  // Check ownership
  const existing = await getLead(DB, id, auth);
  if (!existing) return null;

  const products = data.products
    ? (Array.isArray(data.products) ? JSON.stringify(data.products) : data.products)
    : existing.products;

  const { results } = await DB.prepare(`
    UPDATE leads SET
      first_name = ?, last_name = ?, title = ?, company = ?,
      email = ?, phone = ?, country = ?, linkedin = ?,
      temperature = ?, deal_size = ?, timeline = ?, products = ?,
      notes = ?, assigned_to = ?, next_action = ?, due_date = ?,
      priority = ?, transcript = ?, show_name = ?,
      updated_at = datetime('now')
    WHERE id = ?
    RETURNING *
  `).bind(
    data.first_name ?? existing.first_name,
    data.last_name ?? existing.last_name,
    data.title ?? existing.title,
    data.company ?? existing.company,
    data.email ?? existing.email,
    data.phone ?? existing.phone,
    data.country ?? existing.country,
    data.linkedin ?? existing.linkedin,
    data.temperature ?? existing.temperature,
    data.deal_size ?? existing.deal_size,
    data.timeline ?? existing.timeline,
    products,
    data.notes ?? existing.notes,
    data.assigned_to ?? existing.assigned_to,
    data.next_action ?? existing.next_action,
    data.due_date ?? existing.due_date,
    data.priority ?? existing.priority,
    data.transcript ?? existing.transcript,
    data.show_name ?? existing.show_name,
    id
  ).all();

  return results[0] || null;
}

/**
 * Delete a lead
 */
export async function deleteLead(DB, id, auth) {
  const existing = await getLead(DB, id, auth);
  if (!existing) return false;

  await DB.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
  return true;
}

/**
 * Update only the voice_data column for a lead (separate audio upload endpoint)
 */
export async function updateLeadAudio(DB, id, voiceData, auth) {
  const existing = await getLead(DB, id, auth);
  if (!existing) return null;

  try {
    await DB.prepare('UPDATE leads SET voice_data = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(voiceData, id).run();
    return true;
  } catch (e) {
    // voice_data column may not exist on older DB instances — degrade gracefully
    console.warn('updateLeadAudio failed (column may be missing):', e.message);
    return false;
  }
}

/**
 * Get stats for the leads list dashboard
 */
export async function getStats(DB, auth) {
  const where = auth.role !== 'admin' ? 'WHERE user_id = ?' : '';
  const params = auth.role !== 'admin' ? [auth.id] : [];

  const { results } = await DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN temperature = 'hot' THEN 1 ELSE 0 END) as hot,
      SUM(CASE WHEN temperature = 'warm' THEN 1 ELSE 0 END) as warm,
      SUM(CASE WHEN temperature = 'cold' THEN 1 ELSE 0 END) as cold,
      SUM(CASE WHEN next_action != '' AND next_action != 'No Action' THEN 1 ELSE 0 END) as actions_pending
    FROM leads ${where}
  `).bind(...params).all();

  return results[0] || { total: 0, hot: 0, warm: 0, cold: 0, actions_pending: 0 };
}
