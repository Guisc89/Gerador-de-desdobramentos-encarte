import { Router, type IRouter } from "express";
import healthRouter from "./health";
import encarteRouter from "./encarte";
import telasRouter from "./telas";

const router: IRouter = Router();

router.use(healthRouter);
router.use(encarteRouter);
router.use(telasRouter);


export default router;
