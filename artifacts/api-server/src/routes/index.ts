import { Router, type IRouter } from "express";
import healthRouter from "./health";
import devopsRouter from "./devops";
import focusFeedRouter from "./focus-feed";
import storageRouter from "./storage";
import environmentRouter from "./environment";
import workflowRouter from "./workflow";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(devopsRouter);
router.use(focusFeedRouter);
router.use(storageRouter);
router.use(environmentRouter);
router.use(workflowRouter);
router.use(aiRouter);

export default router;
