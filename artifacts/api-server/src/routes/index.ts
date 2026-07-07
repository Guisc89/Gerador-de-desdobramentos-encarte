import { Router, type IRouter } from "express";
import healthRouter from "./health";
import encarteRouter from "./encarte";
import telasRouter from "./telas";
import cardsRouter from "./cards";

const router: IRouter = Router();

router.use(healthRouter);
router.use(encarteRouter);
router.use(telasRouter);
router.use(cardsRouter);


export default router;
