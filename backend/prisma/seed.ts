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

async function upsertUser(
  name: string,
  email: string,
  password: string,
  role: Role,
) {
  const passwordHash = await hashPassword(password);
  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: { name, email: email.toLowerCase(), passwordHash, role },
  });
}

async function main() {
  await upsertUser(
    'Administrador',
    required('SEED_ADMIN_EMAIL'),
    required('SEED_ADMIN_PASSWORD'),
    Role.ADMIN,
  );
  await upsertUser(
    'Vendedor',
    required('SEED_SELLER_EMAIL'),
    required('SEED_SELLER_PASSWORD'),
    Role.SELLER,
  );
  console.log(
    'Seed completado: administrador y vendedor creados (o ya existentes).',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
