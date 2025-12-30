import { Client } from "https://deno.land/x/mysql/mod.ts";
import { log, log_error } from "./logger.ts";

let dbClient: Client | null = null;
let initialConnectionSucceeded = false;
export const DBVersion = 1; 
const DA_ISPROD = Deno.env.get("DA_ISPROD") === "true";

async function connectToDB(): Promise<Client | null> {
    try {
        const client = await new Client().connect({
            hostname: Deno.env.get("DA_DB_HOST"),
            username: Deno.env.get("DA_DB_USER"),
            password: Deno.env.get("DA_DB_PASS"),
            db: Deno.env.get("DA_DB_NAME"),
            port: 3306,
        });

        if (await ensureDBStructure(client)) {
            log("Initial Connection SUCCESS");
            initialConnectionSucceeded = true;
            dbClient = client;
            return client;
        } else {
            throw new Error("Invalid Initial DB connection? (Maybe DB is starting?)");
        }
    } catch (err) {
        log_error("FAILED TO CONNECT TO DB!");
        log_error(err); 
        return null;
    }
}

/**
 * Safely gets a healthy DB client.
 */
export async function getDBClient(): Promise<Client | null> {
    if (dbClient) {
        try {
            await dbClient.execute("SELECT 1");
            return dbClient;
        } catch (err) {
            log_error("DB client exists but failed SELECT 1 — reconnecting.");
            dbClient = null;
        }
    }

    if (!initialConnectionSucceeded || !dbClient) {
        log("Attempting to establish/restore connection...");
        const client = await connectToDB();
        return client;
    }

    return dbClient;
}

async function ensureDBStructure(client: Client) {
    log("Ensuring DB Structure.");
    try {
        // 1. Users
        await client.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                user_id BIGINT NOT NULL UNIQUE
            )
        `);

        // 2. Boards
        await client.execute(`
            CREATE TABLE IF NOT EXISTS boards (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(20) NOT NULL,
                owner BIGINT NOT NULL,
                calendar_ics_token CHAR(64) NOT NULL,
                is_public BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                background_url VARCHAR(2048) NOT NULL,
                FOREIGN KEY (owner) REFERENCES users(user_id) ON DELETE CASCADE
            )
        `);

        // 3. Lists
        await client.execute(`
            CREATE TABLE IF NOT EXISTS lists (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(20) NOT NULL,
                position INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                board_id BIGINT NOT NULL,
                color CHAR(7),
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
            )
        `);

        // 4. Cards
        await client.execute(`
            CREATE TABLE IF NOT EXISTS cards (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                list_id BIGINT NOT NULL,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_archived BOOLEAN DEFAULT FALSE,
                owner BIGINT NOT NULL,
                color CHAR(7),
                position INT NOT NULL,
                start_date DATE NULL,
                due_date DATE NULL,
                FOREIGN KEY (owner) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
            )
        `);

        // 5. Comments
        await client.execute(`
            CREATE TABLE IF NOT EXISTS comments (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                card_id BIGINT NOT NULL,
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id BIGINT NOT NULL,
                FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        `);

        // 6. Board Members
        await client.execute(`
            CREATE TABLE IF NOT EXISTS board_members (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                user_id BIGINT NOT NULL,
                board_id BIGINT NOT NULL,
                role ENUM('member', 'admin', 'view', 'owner') NOT NULL,
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        `);

        // 7. Board Invites (Fixed referencing and trailing commas)
        await client.execute(`
            CREATE TABLE IF NOT EXISTS board_invites (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                board_id BIGINT NOT NULL,
                inviter_id BIGINT NOT NULL,
                invitee_id BIGINT NOT NULL,
                status ENUM('pending', 'accepted', 'declined') DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
                FOREIGN KEY (inviter_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (invitee_id) REFERENCES users(user_id) ON DELETE CASCADE,
                UNIQUE KEY unique_invite (board_id, invitee_id)
            )
        `);

        // 8. Board Labels
        await client.execute(`
            CREATE TABLE IF NOT EXISTS board_labels (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                board_id BIGINT NOT NULL,
                name VARCHAR(50) NOT NULL UNIQUE,
                color VARCHAR(9) NOT NULL,
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
            )
        `);

        // 9. Card Labels (Fixed trailing comma and added Foreign Key)
        await client.execute(`
            CREATE TABLE IF NOT EXISTS card_labels (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                card_id BIGINT NOT NULL,
                label_id BIGINT NOT NULL,
                FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
                FOREIGN KEY (label_id) REFERENCES board_labels(id) ON DELETE CASCADE
            )
        `);

        // 10. Checklist Items
        await client.execute(`
            CREATE TABLE IF NOT EXISTS checklist_item (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                card_id BIGINT NOT NULL,
                name VARCHAR(50) NOT NULL,
                is_checked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
            )
        `);

        // 11. Card Attachments
        await client.execute(`
            CREATE TABLE IF NOT EXISTS card_attachments (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                card_id BIGINT NOT NULL,
                fileshareUUID VARCHAR(36) NOT NULL,
                name VARCHAR(2048) NOT NULL,
                FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
            )
        `);

        // 12. Favorite Boards
        await client.execute(`
            CREATE TABLE IF NOT EXISTS favorite_boards (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                user_id BIGINT NOT NULL,
                board_id BIGINT NOT NULL,
                source VARCHAR(2048) NOT NULL,
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        `);

        // 13. Recent Boards
        await client.execute(`
            CREATE TABLE IF NOT EXISTS recent_boards (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                user_id BIGINT NOT NULL,
                board_id BIGINT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )
        `);

        // 14. Calendar ICS (Fixed trailing comma)
        await client.execute(`
            CREATE TABLE IF NOT EXISTS calendar_ics (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                board_id BIGINT NOT NULL,
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
            )
        `);

        if (!DA_ISPROD) {
            const result = await client.execute(
                "INSERT IGNORE INTO users (user_id) VALUES (?)",
                [1]
            );
            if (result.affectedRows && result.affectedRows > 0) {
                log("Created dev user!");
            } else {
                log("Dev user already existed.");
            }
        }

        log("Ensured DB Structure.");
        return true;
    } catch (err) {
        log_error("DB structure creation failed!");
        log_error(err);
        return false;
    }
}

export default getDBClient;
