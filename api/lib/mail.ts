import nodemailer from "npm:nodemailer";

const raw_DA_EMAIL = Deno.env.get("DA_EMAIL");
const raw_DA_EMAIL_PASSWORD = Deno.env.get("DA_EMAIL_PASSWORD");

if (!raw_DA_EMAIL) throw new Error("Missing env: DA_EMAIL");
if (!raw_DA_EMAIL_PASSWORD) throw new Error("Missing env: DA_EMAIL_PASSWORD");

const DA_EMAIL: string = raw_DA_EMAIL;
const DA_EMAIL_PASSWORD: string = raw_DA_EMAIL_PASSWORD;

/**
 * Send an email using Nodemailer (via SMTP).
 *
 * @param recipient - Email address of the recipient.
 * @param subject - Subject line of the email.
 * @param htmlContent - HTML content to include in the email body.
 */
export async function sendEmail(
	recipient: string,
	subject: string,
	htmlContent: string,
): Promise<void> {
	const transporter = nodemailer.createTransport({
		host: "smtp.strato.com",
		port: 465,
		secure: true, // true for port 465, false for port 587
		auth: {
			user: DA_EMAIL,
			pass: DA_EMAIL_PASSWORD,
		},
	});

	await transporter.sendMail({
		from: DA_EMAIL,
		to: recipient,
		subject,
		html: htmlContent,
	});
}

/**
 * Loads an HTML template file and replaces placeholders {{key}} with given values.
 *
 * @param path - The path to the HTML template file.
 * @param replacements - An object with keys and values to replace in the template.
 * @returns The processed HTML string with replacements applied.
 */
export async function loadEmailTemplate(
	path: string,
	replacements: Record<string, string>,
): Promise<string> {
	let html = await Deno.readTextFile(path);

	for (const [key, value] of Object.entries(replacements)) {
		const regex = new RegExp(`{{${key}}}`, "g");
		html = html.replace(regex, value);
	}

	return html;
}

//? example
// await sendEmail(
//	"contact@davidnet.net",
//	"Test Email",
//	await loadEmailTemplate("email_templates/test.html", {
//	date: String(Date.now()),
//	}),
//);
