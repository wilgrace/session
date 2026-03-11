SELECT time, day_of_week, count(*) as cnt 
FROM session_schedules 
WHERE session_template_id = '<your-template-id>'
GROUP BY time, day_of_week
HAVING count(*) > 1;