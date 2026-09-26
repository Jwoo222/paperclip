import { t as tNewUi } from "@/i18n";
/** A missing/invalid write receipt is not proof that the comment was rejected.
 * Kept separate from API clients so the composers can recognize this outcome
 * without coupling their state machine to a mocked or alternate client. */
export class CommentSubmissionUnknownError extends Error {
  constructor() {
    super(
      tNewUi("newUi.ka745fdda3ac7"),
    );
    this.name = "CommentSubmissionUnknownError";
  }
}
