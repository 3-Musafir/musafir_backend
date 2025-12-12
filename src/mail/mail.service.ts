import { MailerService } from '@nestjs-modules/mailer';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import * as fs from 'fs';
import * as handlebars from 'handlebars';
import brevo, {
  TransactionalEmailsApi,
  SendSmtpEmail,
  TransactionalEmailsApiApiKeys
  // ApiClient,
} from '@getbrevo/brevo';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly brevoClient: brevo.TransactionalEmailsApi;
  private readonly templatesDir: string;

  constructor() {
    const brevoApiKey = process.env.BREVO_API_KEY;
    if (!brevoApiKey) {
      throw new Error('BREVO_API_KEY is not set in environment variables');
    }

    const apiInstance = new TransactionalEmailsApi();

    apiInstance.setApiKey(
      TransactionalEmailsApiApiKeys.apiKey,
      brevoApiKey
    );

    this.brevoClient = apiInstance;

    this.templatesDir =
      process.env.NODE_ENV === 'production'
        ? join(process.cwd(), 'dist', 'mail', 'templates')
        : join(process.cwd(), 'src', 'mail', 'templates');
  }


  private renderTemplate(templateName: string, context: Record<string, any>): string {
    const templatePath = join(this.templatesDir, `${templateName}.hbs`);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Email template "${templateName}" not found at ${templatePath}`);
    }

    const templateSource = fs.readFileSync(templatePath, 'utf8');
    const compiledTemplate = handlebars.compile(templateSource);
    return compiledTemplate(context);
  }


  async sendMail(
    to: string,
    subject: string,
    templateName: string,
    context: Record<string, any>,
  ) {
    try {
      if (!to) {
        throw new BadRequestException('Recipient email (to) is required');
      }
      if (!process.env.MUSAFIR_MAIL) {
        throw new BadRequestException(
          'MUSAFIR_MAIL is not set in environment variables',
        );
      }

      const htmlContent = this.renderTemplate(templateName, context);

      const email = new SendSmtpEmail();
      email.subject = subject;
      email.htmlContent = htmlContent;
      email.sender = { email: process.env.MUSAFIR_MAIL };
      email.to = [{ email: to }];

      const response = await this.brevoClient.sendTransacEmail(email);
      this.logger.log(`✅ Email sent successfully to ${to}`);
    } catch (error: any) {
      this.logger.error(`❌ Failed to send email to ${to}: ${error.message}`, error.stack);
      if (error.response?.body) {
        this.logger.error(`Brevo API response: ${JSON.stringify(error.response.body)}`);
      }
      throw error;
    }
  }

  async sendEmailVerification(emailto: string, password: string) {
    try {
      await this.sendMail(
        emailto,
        'Verify Your 3Musafir Account',
        'email-confirmation',
        {
          password: password,
        },
      );
      return true;
    } catch (error) {
      console.log(error);
      return error;
    }
  }

  async sendReEvaluateRequestToJury(
    registrationId: string,
    flagshipName: string,
    name: string,
    email: string,
    musafirNumber: string,
    city: string,
  ) {
    try {
      await this.sendMail(
        process.env.MUSAFIR_MAIL,
        'Re-Evaluate Request to Jury',
        './askJuryToReEvaluate',
        {
          registrationId: registrationId,
          flagshipName: flagshipName,
          name: name,
          email: email,
          musafirNumber: musafirNumber,
          city: city,
        },
      );
    } catch (error) {
      return error;
    }
  }

  async sendTripQuery(
    flagshipId: string,
    flagshipName: string,
    name: string,
    email: string,
    musafirNumber: string,
    city: string,
    tripQuery: string,
  ) {
    if (!process.env.MUSAFIR_MAIL) {
      throw new BadRequestException(
        'From Email is not set in environment variables',
      );
    }

    await this.sendMail(process.env.MUSAFIR_MAIL, 'Trip Query', './tripQuery', {
      flagshipId: flagshipId,
      flagshipName: flagshipName,
      name: name,
      email: email,
      musafirNumber: musafirNumber,
      city: city,
      tripQuery: tripQuery,
    });

    return true;
  }

  async sendPasswordResetEmail(
    email: string,
    resetLink: string,
    userName: string,
  ) {
    try {
      await this.sendMail(
        email,
        'Reset Your 3Musafir Password',
        './password-reset',
        {
          resetLink: resetLink,
          userName: userName,
        },
      );
    } catch (error) {
      return error;
    }
  }

  async sendAccountCreatedEmail(email: string, firstName: string, loginUrl: string) {
    try {
      await this.sendMail(
        email,
        'Your 3M account is ready',
        './account-created',
        {
          firstName,
          loginUrl,
        },
      );
    } catch (error) {
      console.log(error);
      return error;
    }
  }

  async sendVerificationApprovedEmail(email: string, fullName: string) {
    try {
      await this.sendMail(
        email,
        'Your 3Musafir Account Has Been Verified',
        './verification-approved',
        {
          fullName: fullName,
        },
      );
      return true;
    } catch (error) {
      console.log('Error sending verification approved email:', error);
      return error;
    }
  }

  async sendVerificationRejectedEmail(email: string, fullName: string) {
    try {
      await this.sendMail(
        email,
        'Your 3Musafir Account Verification Status',
        './verification-rejected',
        {
          fullName: fullName,
        },
      );
      return true;
    } catch (error) {
      console.log('Error sending verification rejected email:', error);
      return error;
    }
  }

  async sendPaymentApprovedEmail(
    email: string,
    fullName: string,
    amount: number,
    tripName: string,
    paymentDate: Date
  ) {
    try {
      await this.sendMail(
        email,
        'Your 3Musafir Payment Has Been Approved',
        './payment-approved',
        {
          fullName: fullName,
          amount: amount,
          tripName: tripName,
          paymentDate: paymentDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
        },
      );
      return true;
    } catch (error) {
      console.log('Error sending payment approved email:', error);
      return error;
    }
  }

  async sendPaymentRejectedEmail(
    email: string,
    fullName: string,
    amount: number,
    tripName: string,
    reason?: string
  ) {
    try {
      await this.sendMail(
        email,
        'Your 3Musafir Payment Was Not Approved',
        './payment-rejected',
        {
          fullName: fullName,
          amount: amount,
          tripName: tripName,
          reason: reason || 'Please ensure all payment details are correct and the screenshot is clear.',
        },
      );
      return true;
    } catch (error) {
      console.log('Error sending payment rejected email:', error);
      return error;
    }
  }

  async sendAdminRegistrationNotification(context: {
    registrationId: string;
    flagshipId: string;
    flagshipName: string;
    userName: string;
    userEmail?: string;
    userPhone?: string;
    userCity?: string;
    joiningFromCity?: string;
    tier?: string;
    bedPreference?: string;
    roomSharing?: string;
    groupMembers?: string[];
    expectations?: string;
    tripType?: string;
    price?: number;
    amountDue?: number;
    createdAt?: Date | string;
    startDate?: Date | string;
    endDate?: Date | string;
    destination?: string;
    category?: string;
  }) {
    try {
      const formatDate = (d?: Date | string) =>
        d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : undefined;

      await this.sendMail(
        process.env.MUSAFIR_MAIL,
        'New Trip Registration Submitted',
        './admin-registration-notification',
        {
          ...context,
          createdAt: formatDate(context.createdAt),
          startDate: formatDate(context.startDate),
          endDate: formatDate(context.endDate),
          groupMembers: context.groupMembers && context.groupMembers.length ? context.groupMembers : undefined,
        },
      );
      return true;
    } catch (error) {
      console.log('Error sending admin registration notification:', error);
      return error;
    }
  }
}
