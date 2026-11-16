import {createCloudHandler} from '../server/cloud.mjs';

// Vercel maps each /api/:route URL to the existing shared router.
export default createCloudHandler();
