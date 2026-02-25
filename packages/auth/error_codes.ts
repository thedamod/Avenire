import { $ERROR_CODES } from "./client";

export const ERROR_CODES = new Map(
  Object.entries({
    USER_NOT_FOUND: {
      user: ["User not found."],
    },
    FAILED_TO_CREATE_USER: {
      server: ["Unable to create user. Try again later."],
    },
    FAILED_TO_CREATE_SESSION: {
      server: ["Session creation failed. Try again later."],
    },
    INVALID_EMAIL_OR_PASSWORD: {
      user: ["Incorrect email or password."],
    },
    YOU_CANT_UNLINK_YOUR_LAST_ACCOUNT: {
      user: ["This is your last account and you can't unlink it"]
    },
    SOCIAL_ACCOUNT_ALREADY_LINKED: {
      socialAccount: ["This account is linked to another user."],
    },
    EMAIL_NOT_VERIFIED: {
      email: ["Please verify your email. Check your inbox."],
    },
    USER_ALREADY_EXISTS: {
      email: ["You already have an account. Try logging in."],
    },
    EMAIL_CAN_NOT_BE_UPDATED: {
      email: ["Email can't be updated."],
    },
    SESSION_EXPIRED: {
      session: ["Session expired. Please log in again."],
    },
    FAILED_TO_UPDATE_PASSKEY: {
      server: ["Unable to update passkey. Try again later."],
    },
    FAILED_TO_VERIFY_REGISTRATION: {
      server: [
        "Registration verification failed. Try again or contact support.",
      ],
    },
    PASSKEY_NOT_FOUND: {
      passkey: ["No passkey found. Please register one."],
    },
    YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: {
      passkey: ["Not authorized to register this passkey. Contact support."],
    },
  })
);

type ErrorTypes = Partial<
  Record<
    keyof typeof $ERROR_CODES,
    {
      userMessage: string;
      source: string
    }
  >
> & {
  USERNAME_IS_ALREADY_TAKEN_PLEASE_TRY_ANOTHER: {
    userMessage: string,
    source: string
  }
};

const errorCodes = {
  USER_ALREADY_EXISTS: {
    userMessage: "It looks like you already have an account. Please try logging in.",
    source: "email"
  },
  ACCOUNT_NOT_FOUND: {
    userMessage: "We couldn't find your account. Please check your details and try again.",
    source: "user"
  },
  AUTHENTICATION_FAILED: {
    userMessage: "Oops! Authentication didn't work. Please try again.",
    source: "user"
  },
  CHALLENGE_NOT_FOUND: {
    userMessage: "We couldn't find the challenge. Please try again later.",
    source: "server"
  },
  USERNAME_IS_ALREADY_TAKEN_PLEASE_TRY_ANOTHER: {
    userMessage: "Username is taken. Try another.",
    source: "username"
  },
  CREDENTIAL_ACCOUNT_NOT_FOUND: {
    userMessage: "We couldn't find your credential account. Please check and try again.",
    source: "user"
  },
  EMAIL_CAN_NOT_BE_UPDATED: {
    userMessage: "Sorry, we can't update your email at the moment.",
    source: "email"
  },
  EMAIL_NOT_VERIFIED: {
    userMessage: "Please verify your email by checking your inbox.",
    source: "email"
  },
  FAILED_TO_CREATE_SESSION: {
    userMessage: "We couldn't create a session. Please try again later.",
    source: "server"
  },
  FAILED_TO_CREATE_USER: {
    userMessage: "We couldn't create your account. Please try again later.",
    source: "server"
  },
  FAILED_TO_GET_SESSION: {
    userMessage: "We couldn't retrieve your session. Please try again.",
    source: "server"
  },
  FAILED_TO_GET_USER_INFO: {
    userMessage: "We couldn't retrieve your information. Please try again.",
    source: "server"
  },
  FAILED_TO_UNLINK_LAST_ACCOUNT: {
    userMessage: "This is your last account, and it can't be unlinked.",
    source: "user"
  },
  FAILED_TO_UPDATE_PASSKEY: {
    userMessage: "We couldn't update your passkey. Please try again later.",
    source: "server"
  },
  FAILED_TO_UPDATE_USER: {
    userMessage: "We couldn't update your information. Please try again.",
    source: "server"
  },
  FAILED_TO_VERIFY_REGISTRATION: {
    userMessage: "We couldn't verify your registration. Please try again or contact support.",
    source: "server"
  },
  INVALID_EMAIL_OR_PASSWORD: {
    userMessage: "The email or password you entered is incorrect. Please try again.",
    source: "user"
  },
  PASSKEY_NOT_FOUND: {
    userMessage: "No passkey found. Please register one.",
    source: "passkey"
  },
  PROVIDER_NOT_FOUND: {
    userMessage: "We couldn't find the provider. Please try again.",
    source: "server"
  },
  SESSION_EXPIRED: {
    userMessage: "Your session has expired. Please log in again.",
    source: "session"
  },
  SOCIAL_ACCOUNT_ALREADY_LINKED: {
    userMessage: "This account is already linked to another user.",
    source: "socialAccount"
  },
  UNABLE_TO_CREATE_SESSION: {
    userMessage: "We couldn't create a session. Please try again later.",
    source: "server"
  },
  USER_EMAIL_NOT_FOUND: {
    userMessage: "We couldn't find your email. Please check and try again.",
    source: "email"
  },
  USER_NOT_FOUND: {
    userMessage: "We couldn't find your user account. Please check your details.",
    source: "user"
  },
  YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY: {
    userMessage: "You're not authorized to register this passkey. Please contact support.",
    source: "passkey"
  }
} satisfies ErrorTypes;

export const getErrorMessage = (code: string) => {
  if (code in errorCodes) {
    return errorCodes[code as keyof typeof errorCodes];
  }
  return {
    userMessage: "It looks like there was an issue on our end. Please try again, and hopefully, things will be back to normal! If the problem continues, feel free to contact us, and we’ll look into it right away.",
    source: "server"
  };
};
