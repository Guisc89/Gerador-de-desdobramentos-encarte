import { Router, type IRouter } from "express";
import healthRouter from "./health";
import encarteRouter from "./encarte";
import telasRouter from "./telas";
import cardsRouter from "./cards";
import storiesRouter from "./stories";
import historicoRouter from "./historico";

const router: IRouter = Router();

router.use(healthRouter);
router.use(encarteRouter);
router.use(telasRouter);
router.use(cardsRouter);
router.use(storiesRouter);
router.use(historicoRouter);


export default router;
