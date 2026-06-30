import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { testDb, makeFakeStorage, signInitData } from './helpers';

// Минимальный валидный PNG 1x1.
const PNG_1x1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Минимальный "PDF" (просто корректный base64 для теста).
const FAKE_PDF_BASE64 = Buffer.from('%PDF-1.4 fake content').toString('base64');

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function futureISO(days = 7): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function lotBody() {
  return {
    title: 'Тест лот',
    description: 'Описание',
    categories: ['Красота'],
    platforms: ['Instagram'],
    budget: 100_000,
    deadline: futureISO(),
    requirements: [],
  };
}

// Компания с профилем и хранилищем.
async function companyApp(tgId?: number): Promise<{
  app: FastifyInstance;
  token: string;
  companyId: string;
  calls: { put: number; getStream: number };
}> {
  const fake = makeFakeStorage();
  const app = buildApp({ db: testDb, storage: fake.storage });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), tgId ? { id: tgId } : {}) },
  });
  const token = auth.json().token;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
  const prof = await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: { name: `ООО Тест ${tgId ?? ''}` },
  });
  const companyId = prof.json().user.profile.id as string;
  return { app, token, companyId, calls: fake.calls };
}

// Компания создаёт лот со статусом active напрямую в БД (минуя gate оплаты).
async function companyWithLot(tgId?: number) {
  const { app, token, companyId, calls } = await companyApp(tgId);
  const lot = await testDb.lot.create({
    data: {
      companyId,
      title: 'Тест лот',
      description: 'Описание',
      categories: ['Красота'],
      platforms: ['Instagram'],
      budget: 100_000,
      deadline: new Date(Date.now() + 7 * 86_400_000),
      requirements: [],
      status: 'active',
    },
  });
  return { app, token, lotId: lot.id, calls };
}

// Блогер с профилем.
async function bloggerApp(tgId: number): Promise<{ app: FastifyInstance; token: string }> {
  const app = buildApp({ db: testDb });
  await app.ready();
  const auth = await app.inject({
    method: 'POST',
    url: '/auth/telegram',
    payload: { initData: signInitData(new Date(), { id: tgId }) },
  });
  const token = auth.json().token;
  await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'blogger' } });
  await app.inject({
    method: 'PUT',
    url: '/me/profile',
    headers: bearer(token),
    payload: { displayName: `Блогер ${tgId}`, phone: '+77000000001', categories: ['Красота'], linkedAccounts: [] },
  });
  return { app, token };
}

describe('POST /lots/:id/attachments', () => {
  it('владелец загружает PNG → 200, вложение с mediaUrl', async () => {
    const { app, token, lotId, calls } = await companyWithLot();
    const res = await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(200);
    const att = res.json().attachment;
    expect(att.id).toBeTruthy();
    expect(att.mediaUrl).toMatch(/^\/media\/file_/);
    expect(att.contentType).toBe('image/png');
    expect(att.fileName).toBeNull();
    expect(calls.put).toBe(1);
    await app.close();
  });

  it('владелец загружает PDF с fileName → вложение сохраняет fileName', async () => {
    const { app, token, lotId } = await companyWithLot();
    const res = await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'application/pdf', data: FAKE_PDF_BASE64, fileName: 'brief.pdf' },
    });
    expect(res.statusCode).toBe(200);
    const att = res.json().attachment;
    expect(att.contentType).toBe('application/pdf');
    expect(att.fileName).toBe('brief.pdf');
    await app.close();
  });

  it('не владелец → 403', async () => {
    const { app: app1, lotId } = await companyWithLot(700001001);
    await app1.close();

    const { app: app2, token: token2 } = await companyApp(700001002);
    const res = await app2.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token2),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(403);
    await app2.close();
  });

  it('неверный contentType (gif) → 400', async () => {
    const { app, token, lotId } = await companyWithLot();
    const res = await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'image/gif', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('файл > 48 МБ → 400', async () => {
    const { app, token, lotId } = await companyWithLot();
    const bigData = Buffer.alloc(48 * 1024 * 1024 + 10).toString('base64');
    const res = await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'image/png', data: bigData },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('превышение лимита (11 вложений) → 400', async () => {
    const { app, token, lotId } = await companyWithLot();
    for (let i = 0; i < 10; i++) {
      const r = await app.inject({
        method: 'POST',
        url: `/lots/${lotId}/attachments`,
        headers: bearer(token),
        payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
      });
      expect(r.statusCode).toBe(200);
    }
    const overflow = await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(overflow.statusCode).toBe(400);
    await app.close();
  });

  it('блогер → 403', async () => {
    const { app: cApp, lotId } = await companyWithLot(700002001);
    await cApp.close();

    const { app, token } = await bloggerApp(700002002);
    const res = await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('без хранилища → 503', async () => {
    const app = buildApp({ db: testDb });
    await app.ready();
    const auth = await app.inject({
      method: 'POST',
      url: '/auth/telegram',
      payload: { initData: signInitData(new Date(), { id: 700003001 }) },
    });
    const token = auth.json().token;
    await app.inject({ method: 'PUT', url: '/me/role', headers: bearer(token), payload: { role: 'company' } });
    await app.inject({ method: 'PUT', url: '/me/profile', headers: bearer(token), payload: { name: 'X' } });
    const lot = await app.inject({ method: 'POST', url: '/lots', headers: bearer(token), payload: lotBody() });
    const lotId = lot.json().lot.id;
    const res = await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});

describe('DELETE /lots/:id/attachments/:attachmentId', () => {
  async function uploadAttachment(app: FastifyInstance, token: string, lotId: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    return res.json().attachment.id as string;
  }

  it('владелец удаляет → 204', async () => {
    const { app, token, lotId } = await companyWithLot();
    const attId = await uploadAttachment(app, token, lotId);
    const res = await app.inject({
      method: 'DELETE',
      url: `/lots/${lotId}/attachments/${attId}`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it('не владелец → 403', async () => {
    const { app: app1, token: t1, lotId } = await companyWithLot(800001001);
    const attId = await uploadAttachment(app1, t1, lotId);
    await app1.close();

    const { app: app2, token: t2 } = await companyApp(800001002);
    const res = await app2.inject({
      method: 'DELETE',
      url: `/lots/${lotId}/attachments/${attId}`,
      headers: bearer(t2),
    });
    expect(res.statusCode).toBe(403);
    await app2.close();
  });

  it('несуществующий attachmentId → 404', async () => {
    const { app, token, lotId } = await companyWithLot();
    const res = await app.inject({
      method: 'DELETE',
      url: `/lots/${lotId}/attachments/nonexistent_id`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /lots/:id — включает attachments', () => {
  it('лот без вложений → attachments = []', async () => {
    const { app, token, lotId } = await companyWithLot();
    const res = await app.inject({ method: 'GET', url: `/lots/${lotId}`, headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    expect(res.json().lot.attachments).toEqual([]);
    await app.close();
  });

  it('лот с вложениями → attachments содержит mediaUrl', async () => {
    const { app, token, lotId } = await companyWithLot();

    await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'application/pdf', data: FAKE_PDF_BASE64, fileName: 'brief.pdf' },
    });

    const res = await app.inject({ method: 'GET', url: `/lots/${lotId}`, headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const attachments = res.json().lot.attachments as { mediaUrl: string; contentType: string; fileName: string | null }[];
    expect(attachments).toHaveLength(2);
    expect(attachments[0].contentType).toBe('image/png');
    expect(attachments[0].mediaUrl).toMatch(/^\/media\//);
    expect(attachments[1].contentType).toBe('application/pdf');
    expect(attachments[1].fileName).toBe('brief.pdf');
    await app.close();
  });

  it('блогер тоже видит вложения в GET /lots/:id', async () => {
    const { app: cApp, token: cToken, lotId } = await companyWithLot(900001001);
    await cApp.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(cToken),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    await cApp.close();

    const { app, token } = await bloggerApp(900001002);
    const res = await app.inject({ method: 'GET', url: `/lots/${lotId}`, headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const atts = res.json().lot.attachments;
    expect(atts).toHaveLength(1);
    expect(atts[0].mediaUrl).toMatch(/^\/media\//);
    await app.close();
  });

  it('GET /lots (лента) — attachments отсутствует (не включается в список)', async () => {
    const { app, token, lotId } = await companyWithLot();
    await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    const res = await app.inject({ method: 'GET', url: '/lots', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const lot = res.json().lots[0];
    expect(lot.attachments).toBeUndefined();
    await app.close();
  });
});

describe('GET /media/:fileId — Content-Disposition при скачивании', () => {
  it('документ → mediaUrl содержит ?name=&type=; заголовок attachment с именем + верный Content-Type', async () => {
    const { app, token, lotId } = await companyWithLot(1001001001);
    const uploadRes = await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'application/pdf', data: FAKE_PDF_BASE64, fileName: 'бриф.pdf' },
    });
    expect(uploadRes.statusCode).toBe(200);
    const att = uploadRes.json().attachment as { mediaUrl: string };

    // mediaUrl документа должен содержать ?name= и &type=
    expect(att.mediaUrl).toContain('?name=');
    expect(att.mediaUrl).toContain('&type=');

    const mediaRes = await app.inject({ method: 'GET', url: att.mediaUrl });
    expect(mediaRes.statusCode).toBe(200);

    // Content-Disposition: attachment с именем файла (кириллица в filename*)
    const cd = mediaRes.headers['content-disposition'] as string;
    expect(cd).toBeTruthy();
    expect(cd).toContain('attachment');
    expect(cd).toContain('filename');
    // filename* содержит percent-encoded кириллицу
    expect(cd).toContain('%D0%B1%D1%80%D0%B8%D1%84'); // «бриф» в UTF-8

    // Content-Type берётся из ?type= (не из кэша Telegram)
    expect(mediaRes.headers['content-type']).toBe('application/pdf');
    await app.close();
  });

  it('документ с ASCII-именем → filename и filename* в заголовке', async () => {
    const { app, token, lotId } = await companyWithLot(1001001002);
    const uploadRes = await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        data: FAKE_PDF_BASE64,
        fileName: 'brief.docx',
      },
    });
    const att = uploadRes.json().attachment as { mediaUrl: string };

    const mediaRes = await app.inject({ method: 'GET', url: att.mediaUrl });
    expect(mediaRes.statusCode).toBe(200);

    const cd = mediaRes.headers['content-disposition'] as string;
    expect(cd).toContain('attachment');
    expect(cd).toContain('brief.docx');
    expect(mediaRes.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    await app.close();
  });

  it('картинка → mediaUrl без параметров (inline для <img>); downloadUrl содержит ?name=&type=', async () => {
    const { app, token, lotId } = await companyWithLot(1001001003);
    const uploadRes = await app.inject({
      method: 'POST',
      url: `/lots/${lotId}/attachments`,
      headers: bearer(token),
      payload: { contentType: 'image/png', data: PNG_1x1_BASE64 },
    });
    const att = uploadRes.json().attachment as { mediaUrl: string; downloadUrl: string };

    // mediaUrl без query-params → inline для <img src>
    expect(att.mediaUrl).not.toContain('?');

    // downloadUrl всегда содержит параметры скачивания
    expect(att.downloadUrl).toContain('?name=');
    expect(att.downloadUrl).toContain('&type=');

    // Через mediaUrl: нет Content-Disposition (браузер показывает inline, превью работают)
    const inlineRes = await app.inject({ method: 'GET', url: att.mediaUrl });
    expect(inlineRes.statusCode).toBe(200);
    expect(inlineRes.headers['content-disposition']).toBeFalsy();

    // Через downloadUrl: Content-Disposition: attachment → файл скачивается с именем
    const dlRes = await app.inject({ method: 'GET', url: att.downloadUrl });
    expect(dlRes.statusCode).toBe(200);
    expect(dlRes.headers['content-disposition']).toContain('attachment');
    expect(dlRes.headers['content-type']).toBe('image/png');
    await app.close();
  });

  it('картинка без fileName → downloadUrl синтезирует имя из contentType (image.png / image.jpg / image.webp)', async () => {
    const cases = [
      { contentType: 'image/png', expectedName: 'image.png' },
      { contentType: 'image/jpeg', expectedName: 'image.jpg' },
      { contentType: 'image/webp', expectedName: 'image.webp' },
    ] as const;
    let tgId = 1001001010;
    for (const { contentType, expectedName } of cases) {
      const { app, token, lotId } = await companyWithLot(tgId++);
      const uploadRes = await app.inject({
        method: 'POST',
        url: `/lots/${lotId}/attachments`,
        headers: bearer(token),
        payload: { contentType, data: PNG_1x1_BASE64 },
      });
      const att = uploadRes.json().attachment as { downloadUrl: string };
      expect(att.downloadUrl).toContain(encodeURIComponent(expectedName));

      const dlRes = await app.inject({ method: 'GET', url: att.downloadUrl });
      expect(dlRes.headers['content-disposition']).toContain(expectedName);
      await app.close();
    }
  });
});

describe('acceptedCount в DTO лота', () => {
  it('GET /lots — acceptedCount=0 у нового лота', async () => {
    const { app, token } = await companyWithLot(1002001001);
    const res = await app.inject({ method: 'GET', url: '/lots', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const lot = res.json().lots[0] as { acceptedCount: number };
    expect(lot.acceptedCount).toBe(0);
    await app.close();
  });

  it('GET /lots/:id — acceptedCount растёт после accept', async () => {
    const { app: cApp, token: cToken, lotId } = await companyWithLot(1002002001);
    const { app: bApp, token: bToken } = await bloggerApp(1002002002);

    const rRes = await bApp.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses`,
      headers: bearer(bToken),
      payload: { message: 'Хочу' },
    });
    const responseId = rRes.json().response.id as string;
    await bApp.close();

    const before = await cApp.inject({ method: 'GET', url: `/lots/${lotId}`, headers: bearer(cToken) });
    expect(before.json().lot.acceptedCount).toBe(0);

    await cApp.inject({
      method: 'POST',
      url: `/lots/${lotId}/responses/${responseId}/accept`,
      headers: bearer(cToken),
    });

    const after = await cApp.inject({ method: 'GET', url: `/lots/${lotId}`, headers: bearer(cToken) });
    expect(after.json().lot.acceptedCount).toBe(1);
    await cApp.close();
  });

  it('GET /me/lots — acceptedCount присутствует (число)', async () => {
    const { app, token } = await companyWithLot(1002003001);
    const res = await app.inject({ method: 'GET', url: '/me/lots', headers: bearer(token) });
    expect(res.statusCode).toBe(200);
    const lot = res.json().lots[0] as { acceptedCount: number };
    expect(typeof lot.acceptedCount).toBe('number');
    expect(lot.acceptedCount).toBe(0);
    await app.close();
  });
});
