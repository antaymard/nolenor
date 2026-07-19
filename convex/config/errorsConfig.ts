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
};

export default errors;
