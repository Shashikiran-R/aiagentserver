import { Router } from 'express';
import { getPendingAction, updateActionStatus } from '../persistence/operations';

export const approvalRoutes = Router();

approvalRoutes.get('/:actionId', async (req, res) => {
  const { actionId } = req.params;
  
  try {
    const action = await getPendingAction(actionId);
    
    if (!action) {
      return res.status(404).send('Action not found');
    }

    if (action.status !== 'pending_approval') {
      return res.send(`<h2>Action is currently: ${action.status}</h2>`);
    }

    const now = new Date().toISOString();
    if (action.expires_at < now) {
      await updateActionStatus(actionId, 'expired');
      return res.send('<h2>Action expired</h2>');
    }

    res.send(`
      <html>
        <head><title>Approve Action</title></head>
        <body style="font-family: sans-serif; max-width: 600px; margin: 40px auto;">
          <h2>Approve Action: ${action.action_type}</h2>
          <pre style="background: #f4f4f4; padding: 15px; border-radius: 5px;">${JSON.stringify(action.payload, null, 2)}</pre>
          <div style="margin-top: 20px;">
            <form method="POST" action="/approve/${actionId}" style="display:inline;">
              <input type="hidden" name="decision" value="approve">
              <button type="submit" style="padding: 10px 20px; background: #28a745; color: white; border: none; cursor: pointer;">Approve</button>
            </form>
            <form method="POST" action="/approve/${actionId}" style="display:inline; margin-left: 10px;">
              <input type="hidden" name="decision" value="reject">
              <button type="submit" style="padding: 10px 20px; background: #dc3545; color: white; border: none; cursor: pointer;">Reject</button>
            </form>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
});

approvalRoutes.post('/:actionId', async (req, res) => {
  const { actionId } = req.params;
  const { decision } = req.body;
  
  try {
    const action = await getPendingAction(actionId);
    if (!action || action.status !== 'pending_approval') {
      return res.status(400).send('Invalid action state.');
    }

    if (decision === 'approve') {
      await updateActionStatus(actionId, 'approved');
      res.send('<h2>Action Approved! You can now proceed in your AI client.</h2>');
    } else if (decision === 'reject') {
      await updateActionStatus(actionId, 'rejected');
      res.send('<h2>Action Rejected.</h2>');
    } else {
      res.status(400).send('Invalid decision.');
    }
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
});
