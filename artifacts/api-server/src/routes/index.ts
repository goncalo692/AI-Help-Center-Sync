import { Router, type IRouter } from "express";
import healthRouter from "./health";
import settingsRouter from "./settings";
import folderMappingsRouter from "./folderMappings";
import syncRouter from "./sync";
import confluenceRouter from "./confluence";

const router: IRouter = Router();

router.use(healthRouter);
router.use(settingsRouter);
router.use(folderMappingsRouter);
router.use(syncRouter);
router.use(confluenceRouter);

export default router;
