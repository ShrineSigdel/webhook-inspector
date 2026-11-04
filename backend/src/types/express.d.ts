// `requireAuth` and `optionalAuth` attach the verified user's ID to the
// request. Declaring it here keeps every route typed without casting.
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export {};
