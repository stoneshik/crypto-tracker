import { createAdmin } from '../auth/admin';
import { AuthRepository } from '../auth/repository';
import { loadConfig } from '../config/load-config';
import { openDatabase } from '../database';

async function main(): Promise<void> {
    const config = loadConfig({ ...process.env, SYNC_ENABLED: 'false' });
    const db = openDatabase(config);
    try {
        const admin = await createAdmin(new AuthRepository(db), {
            email: process.env.ADMIN_EMAIL,
            password: process.env.ADMIN_PASSWORD,
        });
        console.log(`Администратор ${admin.email} создан.`);
    } finally {
        db.close();
    }
}

void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Не удалось создать администратора');
    process.exitCode = 1;
});
