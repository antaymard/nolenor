const errors = {
  CANVAS_NOT_FOUND: "This canvas does not exist.",
  NODE_NOT_FOUND: "This node does not exist in this canvas.",
  NODE_DATA_NOT_FOUND_FOR_NODE: "No nodeData is linked to this node.",
  NODE_DATA_NOT_FOUND: "This nodeData does not exist.",
  UNAUTHORIZED_USER: "You are not authenticated or do not have access.",
  USER_NOT_FOUND: "This user does not exist.",
  ACCOUNT_DELETION_EMAIL_MISMATCH:
    "This is not the email address of your account.",
  ACCOUNT_DELETION_NO_EMAIL:
    "This account has no email address, so it cannot be deleted from here. Please contact support.",
  EMAIL_NOT_FOUND: "No user found with this email address.",
  SHARING_WITH_SELF: "You cannot share with yourself.",
  EDGE_SELF_CONNECTION_NOT_ALLOWED: "A node cannot be connected to itself.",
  EDGE_NOT_FOUND: "This connection does not exist in this canvas.",
  EDGES_MUST_SHARE_CANVAS: "These connections must belong to the same canvas.",
  EDGE_SOURCE_NOT_FOUND: "The source node of this connection does not exist.",
  EDGE_TARGET_NOT_FOUND: "The target node of this connection does not exist.",
  EDGE_ID_ALREADY_TAKEN:
    "This connection id is already used in another canvas.",
  SOURCE_AND_TARGET_CANVAS_MUST_BE_DIFFERENT:
    "Source and target canvases must be different.",
  NODES_MUST_SHARE_CANVAS: "These nodes must belong to the same canvas.",
  NODE_ID_ALREADY_TAKEN: "This node id is already used in another canvas.",
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
  IMAGE_GENERATION_MODEL_NO_REFERENCES:
    "This model does not accept reference images. Pick another model, or remove the references.",
  IMAGE_GENERATION_TOO_MANY_REFERENCES:
    "Too many reference images for this model.",
};

export default errors;
