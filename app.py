from flask import Flask, render_template, request, jsonify
from flask_sqlalchemy import SQLAlchemy
import os

app = Flask(__name__)

# Configure the PostgreSQL database connection
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:Admin%21006@localhost:5432/Strefa'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Define the database models
class MapIcon(db.Model):
    __tablename__ = 'map_icon'  # Ensure the table name matches 'map_icon'
    id = db.Column(db.Integer, primary_key=True)
    x_position = db.Column(db.Float, nullable=False)
    y_position = db.Column(db.Float, nullable=False)
    icon_type = db.Column(db.String(50))
    icon_color = db.Column(db.String(7))  # Store the color as a hex code
    name = db.Column(db.String(100))
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=db.func.current_timestamp())

class Connection(db.Model):
    __tablename__ = 'connection'  # Ensure the table name matches 'connection'
    id = db.Column(db.Integer, primary_key=True)
    icon_from_id = db.Column(db.Integer, db.ForeignKey('map_icon.id'), nullable=False)
    icon_to_id = db.Column(db.Integer, db.ForeignKey('map_icon.id'), nullable=False)

# Create the tables if they don't exist
with app.app_context():
    db.create_all()

# Route to render the HTML template with the map
@app.route('/')
def index():
    return render_template('index.html')

# API endpoint to handle icon submission (create new icon)
@app.route('/add_icon', methods=['POST'])
def add_icon():
    data = request.json
    new_icon = MapIcon(
        x_position=data['x_position'],
        y_position=data['y_position'],
        icon_type=data['icon_type'],
        icon_color=data['icon_color'],  # Store the color
        name=data['name'],
        description=data['description']
    )
    db.session.add(new_icon)
    db.session.commit()
    return jsonify({'success': True, 'id': new_icon.id})

# API endpoint to get all icons
@app.route('/get_icons', methods=['GET'])
def get_icons():
    icons = MapIcon.query.all()
    icon_data = [{
        'id': icon.id,
        'x_position': icon.x_position,
        'y_position': icon.y_position,
        'icon_type': icon.icon_type,
        'icon_color': icon.icon_color,
        'name': icon.name,
        'description': icon.description
    } for icon in icons]
    return jsonify(icon_data)

# API endpoint to get a specific icon by ID
@app.route('/get_icon/<int:icon_id>', methods=['GET'])
def get_icon(icon_id):
    icon = MapIcon.query.get(icon_id)
    if icon:
        icon_data = {
            'id': icon.id,
            'x_position': icon.x_position,
            'y_position': icon.y_position,
            'icon_type': icon.icon_type,
            'icon_color': icon.icon_color,
            'name': icon.name,
            'description': icon.description
        }
        return jsonify(icon_data)
    else:
        return jsonify({'success': False, 'error': 'Icon not found'}), 404


# API endpoint to handle adding a connection between icons
@app.route('/add_connection', methods=['POST'])
def add_connection():
    data = request.json
    from_id = data['from_id']
    to_id = data['to_id']
    new_connection = Connection(icon_from_id=from_id, icon_to_id=to_id)
    db.session.add(new_connection)
    db.session.commit()
    return jsonify({'success': True, 'id': new_connection.id})

# API endpoint to get all connections
@app.route('/get_connections', methods=['GET'])
def get_connections():
    connections = Connection.query.all()
    connection_data = [{
        'from_id': connection.icon_from_id,
        'to_id': connection.icon_to_id
    } for connection in connections]
    return jsonify(connection_data)

# API endpoint to get connections for a specific icon
@app.route('/get_connections_for_icon/<int:icon_id>', methods=['GET'])
def get_connections_for_icon(icon_id):
    connections = Connection.query.filter_by(icon_from_id=icon_id).all()
    connected_ids = [conn.icon_to_id for conn in connections]
    return jsonify(connected_ids)

# API endpoint to delete an icon and its connections
@app.route('/delete_icon/<int:icon_id>', methods=['DELETE'])
def delete_icon(icon_id):
    icon = MapIcon.query.get(icon_id)
    if icon:
        # Delete all connections where this icon is involved
        Connection.query.filter((Connection.icon_from_id == icon_id) | (Connection.icon_to_id == icon_id)).delete()
        db.session.delete(icon)
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Icon not found'}), 404

# API endpoint to update an icon's details and its connections
@app.route('/update_icon/<int:icon_id>', methods=['POST'])
def update_icon(icon_id):
    data = request.json
    icon = MapIcon.query.get(icon_id)
    
    if icon:
        icon.icon_type = data['icon_type']
        icon.icon_color = data['icon_color']
        icon.name = data['name']
        icon.description = data['description']
        db.session.commit()

        # Update connections: remove old connections and add new ones
        Connection.query.filter_by(icon_from_id=icon_id).delete()  # Remove old connections
        db.session.commit()

        for to_id in data['connections']:
            new_connection = Connection(icon_from_id=icon_id, icon_to_id=to_id)
            db.session.add(new_connection)

        db.session.commit()
        return jsonify({'success': True})

    return jsonify({'success': False, 'error': 'Icon not found'}), 404

@app.route('/delete_connection', methods=['POST'])
def delete_connection():
    data = request.get_json()
    from_id = data.get('from_id')
    to_id = data.get('to_id')

    # Find the connection in the database
    connection = Connection.query.filter(
        ((Connection.icon_from_id == from_id) & (Connection.icon_to_id == to_id)) |
        ((Connection.icon_from_id == to_id) & (Connection.icon_to_id == from_id))
    ).first()

    if connection:
        db.session.delete(connection)
        db.session.commit()
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'error': 'Connection not found'}), 404


if __name__ == '__main__':
    app.run(debug=True)
