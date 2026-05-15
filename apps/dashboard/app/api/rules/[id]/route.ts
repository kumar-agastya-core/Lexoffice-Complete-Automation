import { requireAuth, getTenantId } from '@/app/lib/auth';
import { query } from '@lexware/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { id } = await params;

  let body: {
    categoryId?: string;
    taxType?: string;
    alwaysUnchecked?: boolean;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const tenantId = getTenantId();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.categoryId !== undefined) {
      setClauses.push(`category_id = $${idx++}`);
      values.push(body.categoryId);
    }
    if (body.taxType !== undefined) {
      setClauses.push(`tax_type = $${idx++}`);
      values.push(body.taxType);
    }
    if (body.alwaysUnchecked !== undefined) {
      setClauses.push(`always_unchecked = $${idx++}`);
      values.push(Boolean(body.alwaysUnchecked));
    }

    if (setClauses.length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id, tenantId);
    const res = await query(
      `UPDATE vendor_fingerprints SET ${setClauses.join(', ')}
        WHERE id = $${idx++} AND tenant_id = $${idx}`,
      values,
    );

    if (res.rowCount === 0) {
      return Response.json({ error: 'Rule not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/rules PATCH]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const deny = requireAuth(request);
  if (deny) return deny;

  const { id } = await params;

  try {
    const tenantId = getTenantId();
    await query(
      `DELETE FROM classification_examples WHERE tenant_id = $1
         AND id IN (
           SELECT ce.id FROM classification_examples ce
             JOIN vendor_fingerprints vf ON vf.vendor_name = (
               SELECT vendor_name FROM vendor_fingerprints WHERE id = $2 AND tenant_id = $1
             )
            WHERE ce.tenant_id = $1
         )`,
      [tenantId, id],
    );
    const res = await query(
      `DELETE FROM vendor_fingerprints WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (res.rowCount === 0) {
      return Response.json({ error: 'Rule not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/rules DELETE]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
