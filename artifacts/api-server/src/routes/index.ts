import { Router, type IRouter } from "express";
import healthRouter from "./health";
import encarteRouter from "./encarte";

const router: IRouter = Router();

router.use(healthRouter);
router.use(encarteRouter);

export default router;
