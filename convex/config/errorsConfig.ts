const errors = {
  CANVAS_NOT_FOUND: "This canvas does not exist.",
  NODE_NOT_FOUND: "This node does not exist in this canvas.",
  NODE_DATA_NOT_FOUND_FOR_NODE: "No nodeData is linked to this node.",
  NODE_DATA_NOT_FOUND: "This nodeData does not exist.",
  UNAUTHORIZED_USER: "You are not authenticated or do not have access.",
  USER_NOT_FOUND: "This user does not exist.",
  EMAIL_NOT_FOUND: "No user found with this email address.",
  SHARING_WITH_SELF: "You cannot share with yourself.",
  SOURCE_AND_TARGET_CANVAS_MUST_BE_DIFFERENT:
    "Source and target canvases must be different.",
  INSUFFICIENT_PERMISSIONS:
    "You do not have the required permission for this action.",
  THREAD_NOT_FOUND_OR_FORBIDDEN: "Thread not found or access denied.",
  TEMPLATE_NOT_FOUND: "This node template does not exist.",
  TOKEN_NOT_FOUND: "This API token does not exist.",
  TOKEN_NAME_REQUIRED: "Token name is required.",
  TOKEN_REVOKED: "This token has been revoked and can no longer be edited.",
  INVALID_USAGE_PERIOD:
    "Invalid usage period. Expected two YYYY-MM-DD dates, in order, at most 366 days apart.",
  UNSUPPORTED_FILE_TYPE: "This file type is not allowed.",
  INVALID_FILE_SIZE: "This file size could not be read.",
  FILE_TOO_LARGE: "This file is too large.",
  TOO_MANY_FILES: "Too many files in a single upload.",
  AUDIO_TOO_LARGE: "This recording is too long to be transcribed.",
  IMAGE_GENERATION_WRONG_NODE_TYPE:
    "Images can only be generated on an image node.",
  IMAGE_GENERATION_EMPTY_PROMPT: "A prompt is required to generate images.",
  IMAGE_GENERATION_ALREADY_RUNNING:
    "A generation is already running on this node.",
  CONNECTION_NOT_FOUND: "This connection does not exist.",
  CONNECTION_PROVIDER_UNKNOWN: "This service is not supported.",
  CONNECTION_PROVIDER_NOT_CONFIGURED:
    "This service is not configured on this deployment yet.",
  CONNECTION_NEEDS_REAUTH:
    "This connection is no longer valid. Reconnect the account.",
  CONNECTION_REFRESH_BUSY:
    "This connection is being refreshed. Try again in a moment.",
  CONNECTION_HOST_NOT_ALLOWED:
    "This address is not part of the service's allowed API hosts.",
};

export default errors;
