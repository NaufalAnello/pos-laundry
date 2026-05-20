const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/usersController');
const { requireAdmin } = require('../middleware/role');

router.get('/',       requireAdmin, ctrl.index);
router.post('/',      requireAdmin, ctrl.store);
router.put('/:id',    requireAdmin, ctrl.update);
router.delete('/:id', requireAdmin, ctrl.destroy);

module.exports = router;
