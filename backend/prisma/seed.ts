/**
 * Crea las cuentas iniciales (D-06). Las credenciales se leen de variables de entorno;
 * no se versionan en el repositorio.
 */
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/auth/password.util';

const prisma = new PrismaClient();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

/** Empresa inicial creada por la migración multiempresa (parte 1). */
const INITIAL_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

async function upsertUser(
  name: string,
  email: string,
  password: string,
  role: Role,
  companyId: string | null,
) {
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: { name, email: email.toLowerCase(), passwordHash, role, companyId },
  });
}

async function main() {
  await upsertUser(
    'Administrador',
    required('SEED_ADMIN_EMAIL'),
    required('SEED_ADMIN_PASSWORD'),
    Role.ADMIN,
    INITIAL_COMPANY_ID,
  );
  await upsertUser(
    'Vendedor',
    required('SEED_SELLER_EMAIL'),
    required('SEED_SELLER_PASSWORD'),
    Role.SELLER,
    INITIAL_COMPANY_ID,
  );
  // SUPER_ADMIN (dueño de la plataforma): no pertenece a ninguna empresa.
  await upsertUser(
    'Super administrador',
    required('SEED_SUPERADMIN_EMAIL'),
    required('SEED_SUPERADMIN_PASSWORD'),
    Role.SUPER_ADMIN,
    null,
  );
  console.log(
    'Seed completado: super administrador, administrador y vendedor creados (o ya existentes).',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
