/**
 * TestTable 路由
 */
import { Router } from "express";
import { testTableController } from "../controllers/testTableController.js";

const router = Router();

router.get("/", testTableController.getAll);
router.get("/:id", testTableController.getById);
router.post("/", testTableController.create);
router.put("/:id", testTableController.update);
router.delete("/:id", testTableController.delete);

export default router;
