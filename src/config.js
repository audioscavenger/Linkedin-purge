export const URLS = {
  login: "https://www.linkedin.com/login",
  comments: "https://www.linkedin.com/in/me/recent-activity/comments/",
  reactions: "https://www.linkedin.com/in/me/recent-activity/reactions/",
};

export const TIMING = {
  // moderate defaults
  actionMin: 2000,
  actionMax: 5000,
  batchMin: 30000,
  batchMax: 60000,
  scrollWait: 800,
  maxEmptyScrolls: 8,
  maxRetries: 4,
  backoffBase: 10000,
  batchSize: 10,
};

export const PATHS = {
  profileDir: ".profile",
  dataDir: "data",
};