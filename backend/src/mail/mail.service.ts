import { Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export interface OutgoingMail {
  /** Nombre visible del remitente: el de la empresa (opción a). */
  fromName: string;
  /** Respuestas del cliente: el correo verificado de la empresa. */
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super('El servidor de correo no está configurado (SMTP_HOST)');
  }
}

/**
 * SWR-MAIL-002, opción (a) de la Fase 1: el correo sale desde la dirección de la
 * plataforma (MAIL_FROM_ADDRESS) con el nombre de la empresa, y Reply-To al correo
 * verificado de la empresa. Así no se suplanta un dominio ajeno (SPF/DKIM).
 * En desarrollo se usa Mailpit (SMTP local). Las credenciales van solo en .env.
 */
@Injectable()
export class MailService {
  private transporter: Transporter | null = null;

  /**
   * Lee la configuración de process.env (ConfigModule ya cargó el .env). No se inyecta
   * ConfigService porque @nestjs/config es solo ESM y Jest no lo puede cargar.
   */
  constructor(
    private readonly env: Record<string, string | undefined> = process.env,
  ) {}

  get configured(): boolean {
    return !!this.get('SMTP_HOST');
  }

  async send(mail: OutgoingMail): Promise<{ messageId: string }> {
    const from = this.get('MAIL_FROM_ADDRESS') ?? 'facturas@tiendapp.test';
    const info = (await this.transport().sendMail({
      from: { name: mail.fromName, address: from },
      replyTo: mail.replyTo,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    })) as { messageId: string };
    return { messageId: info.messageId };
  }

  private get(key: string): string | undefined {
    const v = this.env[key];
    return v === undefined || v === '' ? undefined : v;
  }

  private transport(): Transporter {
    if (!this.configured) throw new MailNotConfiguredError();
    if (!this.transporter) {
      const user = this.get('SMTP_USER');
      this.transporter = createTransport({
        host: this.get('SMTP_HOST'),
        port: Number(this.get('SMTP_PORT') ?? '587'),
        secure: this.get('SMTP_SECURE') === 'true',
        auth: user ? { user, pass: this.get('SMTP_PASS') } : undefined,
        // Un envío nunca debe colgar una petición: corta a los 10 s.
        connectionTimeout: 10_000,
        socketTimeout: 10_000,
      });
    }
    return this.transporter;
  }
}
