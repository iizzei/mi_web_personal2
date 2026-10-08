import { Resend } from 'resend';

// Inicializamos Resend con la clave de las variables de entorno de Vercel.
const resend = new Resend(process.env.RESEND_API_KEY);

// Destinatario final y remitente (se pueden sobreescribir desde el panel de Vercel).
const DESTINO = process.env.CONTACTO_PARA || 'izei.gavilan08@somo.eus';
const REMITENTE = process.env.CONTACTO_DESDE || 'Web Personal <onboarding@resend.dev>';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Escapa el HTML para evitar inyección de código en el correo. */
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Lee el cuerpo de la petición sea JSON, texto o formulario clásico. */
async function leerCuerpo(req) {
  // 1) Vercel suele parsear el body automáticamente.
  if (req.body && typeof req.body === 'object') return req.body;

  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) {
    raw = await new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', () => resolve(data));
      req.on('error', () => resolve(''));
    });
  }

  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  // Solo permitimos peticiones POST (cuando se envía el formulario).
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Método ${req.method} no permitido` });
  }

  try {
    const body = await leerCuerpo(req);
    const nombre = String(body.nombre || '').trim();
    const email = String(body.email || '').trim();
    const mensaje = String(body.mensaje || '').trim();

    // Validaciones básicas antes de intentar enviar.
    if (!nombre || !email || !mensaje) {
      return res.status(400).json({ error: 'Faltan campos: nombre, correo y mensaje son obligatorios.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'El correo electrónico no es válido.' });
    }
    if (nombre.length > 120 || email.length > 200 || mensaje.length > 5000) {
      return res.status(400).json({ error: 'Alguno de los campos supera la longitud máxima permitida.' });
    }

    const { data, error } = await resend.emails.send({
      from: REMITENTE,
      to: [DESTINO],
      replyTo: email,
      subject: `Nueva solicitud de entrevista de ${nombre}`,
      html: `
        <h2>Nueva solicitud de entrevista desde tu web personal</h2>
        <p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>
        <p><strong>Correo de la empresa:</strong> ${escapeHtml(email)}</p>
        <p><strong>Mensaje:</strong></p>
        <p>${escapeHtml(mensaje).replace(/\n/g, '<br>')}</p>
      `,
    });

    if (error) {
      return res.status(500).json({ error: 'No se pudo enviar el mensaje. Inténtalo de nuevo.' });
    }

    return res.status(200).json({ success: true, message: '¡Mensaje enviado con éxito!', id: data?.id });
  } catch (error) {
    return res.status(500).json({ error: 'Error interno del servidor. Inténtalo más tarde.' });
  }
}
