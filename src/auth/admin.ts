import { credentials } from '../validation';
import { hashPassword } from './password';
import { AuthRepository } from './repository';

export async function createAdmin(repository: AuthRepository, input: unknown, now = Date.now()) {
    const { email, password } = credentials(input, true);
    const { hash, salt } = await hashPassword(password);
    const user = repository.createUser(email, hash, salt, now, 'ADMIN');
    return { id: user.id, email: user.email, role: user.role };
}
